export default function PrayerIcon({ size = 14, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M2 13.5h12M3.5 13V7.5h9V13M6 7.5a2 2 0 0 1 4 0M1.5 7.5 3.5 5v2.5M14.5 7.5 12.5 5v2.5M7 10h2v3H7zM7 4.5a1 1 0 1 1 2 0" />
    </svg>
  );
}
