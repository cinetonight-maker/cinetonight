import { api } from "./shared";

/* ============================================================================
 * Offer a redirect when a slug changes.
 *
 * THIS IS THE FEATURE. Everything else in the Redirect Manager is plumbing —
 * the problem it exists to solve is that renaming a post or page silently
 * breaks every link to it, and the moment that happens is the only moment
 * anyone actually knows the old address.
 *
 * Two calls on purpose: create (which the API always stores DISABLED, no
 * exceptions) then enable. A rename is the one case where the old address is
 * definitely dead and the redirect is definitely wanted, so it is switched on
 * straight away — but through the same door as everything else, rather than
 * carving a special case into the API's "always disabled" rule.
 * ========================================================================= */

export async function offerRedirect(oldPath: string, newPath: string, label: string): Promise<string | null> {
  if (oldPath === newPath) return null;
  const ok = confirm(
    `The address changed.\n\n  was:  ${oldPath}\n  now:  ${newPath}\n\n` +
    `Anyone with the old link - and Google - will get a “page not found” unless it is redirected.\n\n` +
    `Add a redirect from the old address to the new one?`,
  );
  if (!ok) return null;

  const created = await api<{ rule?: { id: string }; error?: string }>("/api/admin/redirects", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: oldPath, to: newPath, reason: "slug_change", note: `Renamed: ${label}` }),
  });
  if (!created.ok || !created.data.rule) {
    return `The ${newPath} save worked, but the redirect could not be created: ${created.data.error ?? "unknown error"}`;
  }

  const enabled = await api<{ error?: string }>("/api/admin/redirects", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: created.data.rule.id, enabled: true }),
  });
  if (!enabled.ok) {
    return `Redirect created but not switched on: ${enabled.data.error ?? "unknown error"}. Turn it on in Redirects.`;
  }
  return `Redirect added: ${oldPath} → ${newPath}. It is temporary for now - make it permanent in Redirects once you are happy.`;
}
