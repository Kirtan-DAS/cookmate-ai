"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
type Calculation = {
  ingredient_states?: Record<string,string>;
  complete: boolean;
  scaled_ingredients: { id?: number; nutrition_state?: "dry"|"cooked"|null; assumed_state?: boolean; name: string; original_quantity: string | null; prepared_quantity: string | null; unit: string | null }[];
  unresolved_ingredients: { name: string; reason: string }[];
  consumed_nutrition: Record<string, number | null>;
  per_serving_nutrition: Record<string, number | null>;
  missing_nutrient_data: string[];
};
const fields: [string,string,string][] = [["calories_kcal","Calories","kcal"],["protein_g","Protein","g"],["carbs_g","Carbs","g"],["fat_g","Fat","g"],["fiber_g","Fiber","g"],["iron_mg","Iron","mg"],["calcium_mg","Calcium","mg"],["potassium_mg","Potassium","mg"]];

function formatIngredientQuantity(value: string): string {
  const text = String(value).trim();
  if (!text) return text;

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;

  return numeric.toLocaleString("en-IN", {
    maximumFractionDigits: 6,
  });
}

export default function RecipeNutrition({ recipeId }: { recipeId: number }) {
  // Existing recipes do not yet store a yield. This is an explicit, editable assumption.
  const [base,setBase]=useState(1);
  const [prepared,setPrepared]=useState(1);
  const [eaten,setEaten]=useState(1);
  const [showYield,setShowYield]=useState(false);
  const [data,setData]=useState<Calculation|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [calculatedFor,setCalculatedFor]=useState("");
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [states,setStates]=useState<Record<string,"dry"|"cooked">>({});
  const changeState=(key:string,state:"dry"|"cooked")=>{setStates(current=>({...current,[key]:state}));setData(null);};
  const signature=`${base}|${prepared}|${eaten}|${JSON.stringify(states)}`;
  const isCurrent=calculatedFor===signature;
  const changePrepared=(n:number)=>{const v=Math.max(1,Math.min(20,n));setPrepared(v);setEaten(old=>Math.min(old,v));setData(null);};
  const changeEaten=(n:number)=>{setEaten(Math.max(0,Math.min(prepared,n)));setData(null);};
  async function request(path:string,payload:object){
    const {data:session}=await supabase.auth.getSession();
    if(!session.session)throw new Error("Please log in to use Nutrition Intelligence.");
    const response=await fetch(`${API}${path}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.session.access_token}`},body:JSON.stringify(payload)});
    const json=await response.json();
    if(!response.ok)throw new Error(typeof json.detail==="string"?json.detail:"Request failed");
    return json;
  }
  async function calculate(){setBusy(true);setMessage("");setData(null);try{const result=await request(`/api/nutrition-intelligence/recipes/${recipeId}/calculate`,{base_servings:base,prepared_servings:prepared,eaten_servings:eaten,ingredient_states:states});setData(result);setCalculatedFor(signature);}catch(e){setMessage(e instanceof Error?e.message:"Calculation failed");}finally{setBusy(false);}}
  async function save(){setBusy(true);setMessage("");try{await request("/api/nutrition-intelligence/meals",{recipe_id:recipeId,base_servings:base,prepared_servings:prepared,eaten_servings:eaten,ingredient_states:states});setMessage("Meal recorded in your nutrition diary.");}catch(e){setMessage(e instanceof Error?e.message:"Could not log meal");}finally{setBusy(false);}}
  useEffect(() => {
    // Recalculate after portion changes. Ignore stale results on unmount.
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      setMessage("");
      try {
        const result = await request(`/api/nutrition-intelligence/recipes/${recipeId}/calculate`, {
          base_servings: base, prepared_servings: prepared, eaten_servings: eaten, ingredient_states:states
        });
        if (!cancelled) { setData(result); setCalculatedFor(signature); }
      } catch (err) {
        if (!cancelled) setMessage(err instanceof Error ? err.message : "Nutrition unavailable");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, base, prepared, eaten, states]);
  const stepButton="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-2xl font-semibold text-gray-800 disabled:opacity-30";
  return <section className="mt-8 rounded-2xl border border-emerald-200 bg-white p-5 text-gray-900 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Portions</h2><Link href="/nutrition" className="text-sm font-semibold text-emerald-700 underline">My nutrition diary</Link></div>

    <div className="mt-6 rounded-xl bg-emerald-50 p-4">
      <h3 className="font-semibold">How many servings will you prepare?</h3>
      <div className="mt-3 flex items-center gap-4"><button type="button" aria-label="Prepare one fewer serving" className={stepButton} disabled={prepared<=1} onClick={()=>changePrepared(prepared-1)}>−</button><span className="min-w-20 text-center text-3xl font-bold" aria-live="polite">{prepared}</span><button type="button" aria-label="Prepare one more serving" className={stepButton} disabled={prepared>=20} onClick={()=>changePrepared(prepared+1)}>+</button><span className="text-sm text-gray-600">{prepared===1?"serving":"servings"}</span></div>
    </div>
    <div className="mt-4"><button type="button" onClick={()=>setShowYield(v=>!v)} className="text-sm font-medium text-emerald-800 underline">{showYield?"Hide original recipe yield":"Check original recipe yield (important)"}</button>
      {!showYield&&<p className="mt-1 text-xs text-amber-800">This recipe has no saved serving yield. Currently assuming it makes 1 serving; confirm before relying on scaled amounts.</p>}
      {showYield&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><label className="block text-sm font-medium" htmlFor={`yield-${recipeId}`}>How many servings does the original ingredient list make?</label><input id={`yield-${recipeId}`} className="mt-2 w-28 rounded-lg border border-gray-300 bg-white p-2" type="number" min="0.25" max="100" step="0.25" value={base} onChange={e=>{const v=Number(e.target.value);if(v>=0.25&&v<=100){setBase(v);setData(null);}}}/><p className="mt-2 text-xs text-gray-700">This changes the scaling calculation, not the saved recipe. Only enter a yield you can confirm.</p></div>}
    </div>
    <div className="mt-6 border-t border-gray-200 pt-5"><h3 className="font-semibold">How much did you eat?</h3><p className="mt-1 text-sm text-gray-600">Select the amount you actually consumed, not the amount cooked.</p>
      <div className="mt-3 flex flex-wrap gap-2">{[0.5,1,prepared].filter((v,i,a)=>v<=prepared&&a.indexOf(v)===i).map(v=><button key={v} type="button" onClick={()=>changeEaten(v)} className={`rounded-full border px-4 py-2 text-sm font-medium ${eaten===v?"border-emerald-700 bg-emerald-700 text-white":"border-gray-300 bg-white text-gray-800"}`}>{v===0.5?"Half":v===1?"One serving":`All ${prepared}`}</button>)}</div>
      <label className="mt-3 flex items-center gap-3 text-sm">Other amount <input aria-label="Other servings eaten" className="w-24 rounded-lg border border-gray-300 p-2" type="number" min="0" max={prepared} step="0.25" value={eaten} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v))changeEaten(v);}}/> servings</label>
    </div>


    {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
    {data&&isCurrent&&<div className="mt-6 space-y-5"><div><h3 className="font-semibold">Ingredients for {prepared} {prepared===1?"serving":"servings"}</h3><div className="mt-2 space-y-2">{data.scaled_ingredients.map((i,index)=><div key={index} className="flex justify-between gap-4 rounded-lg bg-gray-50 p-3 text-sm"><span>{i.name}</span><span>{i.prepared_quantity == null
  ? "Quantity needs review"
  : formatIngredientQuantity(i.prepared_quantity)} {i.unit??""}</span></div>)}</div></div>
      {data.scaled_ingredients.some(i=>i.name.trim().toLowerCase()==="toor dal")&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-950">Confirm how Toor Dal is measured</h3>
        <p className="mt-1 text-sm text-amber-900">Nutrition currently assumes dry (uncooked) dal. Cooked dal has different calories and weight per cup. Select the ingredient state to calculate and save accurately.</p>
        {data.scaled_ingredients.filter(i=>i.name.trim().toLowerCase()==="toor dal").map(i=><label key={i.id??i.name} className="mt-3 flex items-center gap-3 text-sm font-medium">{i.name}<select value={states[String(i.id)]??"dry"} onChange={e=>changeState(String(i.id),e.target.value as "dry"|"cooked")} className="rounded-lg border border-amber-400 bg-white p-2"><option value="dry">Dry / uncooked</option><option value="cooked">Cooked / boiled</option></select><button type="button" onClick={()=>changeState(String(i.id),states[String(i.id)]??"dry")} className="rounded-lg bg-amber-900 px-3 py-2 text-white">Confirm</button></label>)}
      </div>}
      <div><h3 className="font-semibold">Nutrition for {eaten} {eaten===1?"serving":"servings"} eaten</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{fields.map(([key,label,unit])=><div key={key} className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-gray-600">{label}</p><p className="mt-1 text-lg font-bold">{data.consumed_nutrition[key]==null?"Unknown":`${data.consumed_nutrition[key]} ${unit}`}</p></div>)}</div></div>
      {!data.complete&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>Nutrition is incomplete; unavailable values are not estimated.</p><button type="button" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(v=>!v)} className="mt-2 font-medium text-amber-900 underline">{detailsOpen?"Hide details":"Why are values missing?"}</button>{detailsOpen&&<div className="mt-2 space-y-1">{data.unresolved_ingredients.map((i,index)=><p key={index}>{i.name}: {i.reason}</p>)}{data.missing_nutrient_data.length>0&&<p>Some nutrients lack reference data.</p>}</div>}</div>}
      <button type="button" disabled={!data.complete||data.scaled_ingredients.some(i=>i.assumed_state)||eaten<=0||busy} onClick={save} className="rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-40">Log {eaten} servings eaten</button>
    </div>}
  </section>;
}
