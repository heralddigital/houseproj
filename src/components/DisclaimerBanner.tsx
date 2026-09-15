/**
 * Persistent, non-dismissible. The whole app produces indicative output from a
 * drawing it read automatically — the moment this banner can be turned off is
 * the moment someone forgets that.
 */
export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-[13px] leading-snug text-amber-900">
      <strong className="font-semibold">Indicative checks only.</strong> Not a
      substitute for planning advice, Building Control approval, or a structural
      engineer. Rules apply to England; verify current versions of the Approved
      Documents and Planning Portal guidance yourself.
    </div>
  );
}
