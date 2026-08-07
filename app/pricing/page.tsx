import type { Metadata } from "next";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Go Premium",
  description: "Compare MOVIEX plans — HD to 4K streaming, ad-free viewing, and offline downloads. Cancel anytime.",
};

const PLANS = [
  { name: "Basic", price: "₹149", feats: ["HD (720p)", "1 device", "Ad-supported"], hot: false, ghost: true },
  { name: "Premium", price: "₹399", feats: ["Full HD + 4K", "4 devices", "No ads", "Early access"], hot: true, ghost: false },
  { name: "Family", price: "₹599", feats: ["4K + Dolby", "6 devices", "No ads", "Kids profiles", "Offline downloads"], hot: false, ghost: true },
];

export default function PricingPage() {
  return (
    <div className="page">
      <div className="page__head" style={{ textAlign: "center" }}><h1>Go Premium</h1><p>Pick a plan. Cancel anytime.</p></div>
      <div className="plans">
        {PLANS.map((p) => (
          <div className={`plan${p.hot ? " hot" : ""}`} key={p.name}>
            {p.hot && <span className="plan__tag">Most Popular</span>}
            <div className="plan__name">{p.name}</div>
            <div className="plan__price">{p.price}<span>/mo</span></div>
            {p.feats.map((f) => <div className="plan__f" key={f}><Icon name="check" size={15} /> {f}</div>)}
            <button className={`plan__btn${p.ghost ? " ghost" : ""}`}>Choose {p.name}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
