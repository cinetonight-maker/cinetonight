import { permanentRedirect } from "next/navigation";

/**
 * The old "Go Premium" pricing page was leftover demo-template content — it
 * advertised HD/4K streaming plans CineTonight doesn't (and legally must
 * not claim to) sell. A live pricing page promising paid streaming directly
 * contradicts the site's positioning and its own Terms of Service ("does
 * not host, stream, sell, or distribute"), so it 308s home. The file stays
 * (instead of being deleted) so any old bookmark or indexed /pricing URL
 * transfers cleanly to the homepage rather than 404ing.
 */
export default function PricingPage() {
  permanentRedirect("/");
}
