const PREVIEW_ENTRIES = [
  {
    title: "Arterial Blood Gas",
    status: "Verified",
    verified: true,
  },
  {
    title: "Intubation",
    status: "Verified",
    verified: true,
  },
  {
    title: "Cerebral Palsy Case",
    status: "Pending Review",
    verified: false,
  },
] as const;

export function LoginProductPreview({ active: _active = true }: { active?: boolean }) {
  return (
    <div
      className="mt-8 w-full max-w-[390px] overflow-hidden rounded-xl border border-[#E5E1D8] bg-white/95 shadow-[0_8px_30px_rgba(15,31,24,0.05)] backdrop-blur-sm"
      aria-label="Sample clinical logbook preview"
    >
      <div className="border-b border-[#E5E1D8] px-5 py-3">
        <p className="text-xs font-semibold text-[#5E6B64]">
          Recent Submissions &amp; Logs
        </p>
      </div>

      <ul className="divide-y divide-[#EDEAE2]">
        {PREVIEW_ENTRIES.map((entry) => (
          <li
            key={entry.title}
            className="flex items-center justify-between gap-3 px-5 py-3"
          >
            <span className="truncate text-sm font-medium text-[#14231B]">
              {entry.title}
            </span>
            <span
              className={
                entry.verified
                  ? "inline-flex shrink-0 items-center rounded border border-[#CBE7D5] bg-[#EAF7EF] px-2 py-0.5 text-[11px] font-semibold text-[#1F7A49]"
                  : "inline-flex shrink-0 items-center rounded border border-[#EFE0B4] bg-[#FDF6DF] px-2 py-0.5 text-[11px] font-semibold text-[#8A6518]"
              }
            >
              {entry.status}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-[#E5E1D8] px-5 py-3.5">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[#E9E6DE]"
          role="progressbar"
          aria-valuenow={78}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="78% Core Targets Complete"
        >
          <div className="h-full w-[78%] rounded-full bg-[#164A35]" />
        </div>
        <p className="mt-2 text-xs font-medium text-[#5E6B64]">
          78% Core Targets Complete
        </p>
      </div>
    </div>
  );
}
