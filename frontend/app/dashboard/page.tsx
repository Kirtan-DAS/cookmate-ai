"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import Navbar from "@/components/Navbar";
import {supabase} from "@/lib/supabase";
type Recipe={recipe_id:number;title:string;match_percentage:number;cooking_time_minutes:number|null};
type Pantry={id:number;name:string;quantity:string|null;unit:string|null};
type Diary={totals?:Record<string,number>;goals?:Record<string,number|null>};
const API=process.env.NEXT_PUBLIC_API_URL??"http://127.0.0.1:8000";
function photo(name:string){const s=name.toLowerCase();return s.includes("dosa")?"/atelier/dosa.jpg":s.includes("paneer")||s.includes("curry")?"/atelier/paneer.jpg":"/atelier/biryani.jpg"}
function safeNum(n:unknown){return typeof n==="number"&&Number.isFinite(n)?n:null}
export default function Dashboard(){
 const router=useRouter();
 const [ready,setReady]=useState(false);
 const [recipes,setRecipes]=useState<Recipe[]>([]);
 const [pantry,setPantry]=useState<Pantry[]>([]);
 const [diary,setDiary]=useState<Diary|null>(null);
 const [filter,setFilter]=useState("Recommended");
 const [warning,setWarning]=useState("");
 useEffect(()=>{
  let alive=true;
  async function load(){
   const {data:{session}}=await supabase.auth.getSession();
   if(!alive)return;
   if(!session){router.replace("/login");return}
   setReady(true);
   const headers={Authorization:`Bearer ${session.access_token}`};
   const requests=await Promise.allSettled([
    fetch(API+"/api/recipes/matches",{headers,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("Recipes unavailable");return r.json()}),
    fetch(API+"/api/pantry/",{headers,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("Pantry unavailable");return r.json()}),
    fetch(API+"/api/nutrition-intelligence/daily?day="+new Date().toISOString().slice(0,10),{headers,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("Diary unavailable");return r.json()})
   ]);
   if(!alive)return;
   const [a,b,c]=requests;
   if(a.status==="fulfilled")setRecipes(Array.isArray(a.value)?a.value:Array.isArray(a.value?.recipes)?a.value.recipes:[]);
   if(b.status==="fulfilled")setPantry(Array.isArray(b.value)?b.value:Array.isArray(b.value?.items)?b.value.items:[]);
   if(c.status==="fulfilled")setDiary(c.value);
   if(requests.some(x=>x.status==="rejected"))setWarning("Some live information could not be loaded. Other features remain available.");
  }
  void load();return()=>{alive=false}
 },[router]);
 const unique=recipes.filter((r,i,a)=>a.findIndex(x=>x.title.toLowerCase()===r.title.toLowerCase())===i);
 const shown=unique.filter(r=>filter!=="Quick & Easy"||((r.cooking_time_minutes??999)<=20)).slice(0,3);
 const totals=diary?.totals;const goals=diary?.goals;
 const calories=safeNum(totals?.calories_kcal);const target=safeNum(goals?.calories_kcal);
 const percent=calories!==null&&target!==null&&target>0?Math.min(100,Math.max(0,calories/target*100)):0;
 return <div className="cm-app"><Navbar/><main className="cm-main cm-dashboard">
  <section className="cm-hero"><div className="cm-hero-text"><span className="cm-overline">YOUR COOKING COMPANION</span><h1>Good evening!<br/>What’s cooking today?</h1><p>Turn your ingredients into something delicious,<br/> healthy and personal.</p><div className="cm-hero-actions"><Link href="/recipes" className="cm-button cm-orange">▶ &nbsp; Find Recipes</Link><Link href="/pantry" className="cm-button cm-white">▣ &nbsp; Use My Pantry</Link></div></div><img src="/atelier/hero.jpg" alt="Freshly cooked Indian curry" /></section>
  <section className="cm-shortcuts" aria-label="Quick actions"><Link href="/recipes" className="cm-shortcut peach"><span>✧</span><div><b>AI Chef</b><small>Get smart recipe ideas</small></div><strong>›</strong></Link><Link href="/pantry" className="cm-shortcut sage"><span>♧</span><div><b>Pantry</b><small>See what you have</small></div><strong>›</strong></Link><Link href="/nutrition" className="cm-shortcut gold"><span>▥</span><div><b>Nutrition Diary</b><small>Track your meals</small></div><strong>›</strong></Link><Link href="/recipes" className="cm-shortcut blush"><span>♡</span><div><b>Recipe Gallery</b><small>Explore recipes</small></div><strong>›</strong></Link></section>
  {warning&&<p role="status" className="cm-warning">{warning}</p>}
  <section className="cm-rec-section"><div className="cm-section-head"><h2>Recipes for You <span>🌿</span></h2><Link href="/recipes">View All →</Link></div><div className="cm-filters">{["Recommended","Quick & Easy"].map(f=><button key={f} onClick={()=>setFilter(f)} className={filter===f?"selected":""}>{f==="Recommended"?"♨":"◷"} &nbsp; {f}</button>)}<Link href="/recipes">Healthy</Link><Link href="/recipes">Indian</Link><Link href="/recipes">High-Protein</Link></div><div className="cm-recipe-grid">{shown.length?shown.map(r=><Link href={"/recipes/"+r.recipe_id} className="cm-recipe" key={r.recipe_id}><div className="cm-recipe-photo"><img src={photo(r.title)} alt="Food photography for recipe collection"/><span>{Math.round(r.match_percentage)}% Match</span></div><div className="cm-recipe-details"><h3>{r.title}</h3><p>◷ {r.cooking_time_minutes??"—"} min <span>•</span> Pantry match</p><i>▶</i></div></Link>):<div className="cm-empty">No recipes to show yet. <Link href="/recipes">Explore recipes</Link></div>}</div></section>
 </main><aside className="cm-right"><div className="cm-leaves" aria-hidden="true">🌿</div><section className="cm-nutrition-card"><h2>Today’s Nutrition <span>🌿</span></h2><div className="cm-nutrition-body"><div className="cm-calorie-ring" style={{background:`conic-gradient(#318b2d ${percent}%,#dce4c5 ${percent}% 100%)`}}><div><b>{calories===null?"—":Math.round(calories).toLocaleString()}</b><small>/ {target===null?"—":Math.round(target).toLocaleString()} kcal</small></div></div><div className="cm-macros">{[["Protein","protein_g","#4b9b22"],["Carbs","carbs_g","#efaa18"],["Fat","fat_g","#ed668b"]].map(([label,key,color])=>{const val=safeNum(totals?.[key]);const goal=safeNum(goals?.[key]);const p=val!==null&&goal!==null&&goal>0?Math.min(100,val/goal*100):0;return <div key={key}><div className="cm-macro-line"><b>{label}</b><span>{val===null?"—":Math.round(val)}{goal!==null?" / "+Math.round(goal):""} g</span></div><div className="cm-track"><i style={{width:p+"%",background:color}}/></div></div>})}</div></div><Link href="/nutrition" className="cm-small-link">Open diary →</Link></section><section className="cm-pantry-card"><div className="cm-section-head"><h2>My Pantry</h2><Link href="/pantry">View All →</Link></div><div className="cm-pantry-list">{pantry.slice(0,4).map((p,i)=><Link key={p.id} href="/pantry"><span className="cm-food-icon">{["🍅","🧅","🥬","🥔"][i%4]}</span><div><b>{p.name}</b><div className="cm-pantry-line"/></div><span>{p.quantity??"—"} {p.unit??""}</span><strong>›</strong></Link>)}{pantry.length===0&&<p className="cm-empty-small">Your pantry is empty. Add your first ingredient.</p>}</div><Link className="cm-add" href="/pantry">＋ &nbsp; Add Ingredient</Link></section></aside><div className="cm-mobile-spacer"/></div>;
}
