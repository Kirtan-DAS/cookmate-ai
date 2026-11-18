"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
const API=process.env.NEXT_PUBLIC_API_URL??"http://127.0.0.1:8000";
type Pick={recipe_id:number;title:string;pantry_match_percentage:number;nutrition_verified:boolean;protein_g_batch:number|null;fiber_g_batch:number|null;missing_ingredients:string[];unresolved_ingredients:string[]};
type Payload={existing_recipes_first:Pick[];pantry_friendly_needs_nutrition_data:Pick[];count_existing:number;count_fully_verified:number;note:string};
export default function PantryNutritionPicks(){
 const [data,setData]=useState<Payload|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{let live=true;(async()=>{
  try{const {data:{session}}=await supabase.auth.getSession();if(!session)return;
   const res=await fetch(`${API}/api/nutrition-intelligence/recipe-picks`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
   if(!res.ok)throw new Error("Verified recipe recommendations unavailable");
   const value=await res.json() as Payload;if(live)setData(value);
  }catch(e){if(live)setError(e instanceof Error?e.message:"Unable to load recipe picks");}
 })();return()=>{live=false}},[]);
 if(!data){return error?<p className="my-4 text-sm text-amber-800">{error}. You can still browse the recipe catalogue below.</p>:null}
 const verified=data.existing_recipes_first.slice(0,4);
 const fallback=data.pantry_friendly_needs_nutrition_data.slice(0,4);
 return <section className="my-8 rounded-3xl border border-emerald-200 bg-[#f3f7eb] p-5 sm:p-7" aria-label="Existing pantry-friendly recipe suggestions">
   <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Existing recipes first</p>
   <h2 className="mt-2 text-2xl font-bold text-emerald-950">Nourishing meals from your pantry</h2>
   <p className="mt-2 text-sm text-slate-700">These are recipes already saved in CookMate, not AI-invented dishes. Pantry availability and source-backed protein/fiber values determine the priority.</p>
   {verified.length>0?<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{verified.map(item=><Link key={item.recipe_id} href={`/recipes/${item.recipe_id}`} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm hover:border-emerald-500"><span className="text-xs font-bold text-emerald-800">Verified ingredient nutrition</span><h3 className="mt-2 font-bold text-slate-900">{item.title}</h3><p className="mt-2 text-sm">{item.pantry_match_percentage}% pantry match</p><p className="mt-2 text-xs text-slate-600">Whole ingredient batch: {item.protein_g_batch} g protein, {item.fiber_g_batch} g fiber</p><span className="mt-2 inline-block text-sm font-semibold text-emerald-800">View recipe →</span></Link>)}</div>:<p className="mt-5 rounded-xl bg-white p-4 text-sm">No recipes have completely verified ingredient nutrition yet. Your pantry-friendly recipes are listed below while references are completed.</p>}
   {fallback.length>0&&<><h3 className="mt-6 text-base font-bold">Pantry-friendly recipes needing nutrition references</h3><div className="mt-3 flex flex-wrap gap-2">{fallback.map(item=><Link key={item.recipe_id} href={`/recipes/${item.recipe_id}`} className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm">{item.title} · {item.pantry_match_percentage}% match</Link>)}</div></>}
   <p className="mt-4 text-xs text-slate-600">Protein/fiber figures describe the full ingredient batch, not one serving. Confirm recipe yield, cooking state and dietary restrictions before relying on nutrition or suitability.</p>
 </section>
}
