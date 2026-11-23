import { useUpdateStore } from "../../state/update-store";

const LINK = "font-semibold text-accent-text hover:underline";

/** The status bar's update offer: shown once a newer version is found, until "Later". */
export function UpdateNotice() {
  const status = useUpdateStore((s) => s.status);
  const dismissed = useUpdateStore((s) => s.dismissed);

  if (status.kind === "downloading") {
    return (
      <span role="status">
        Downloading Narada {status.version}…{status.percent === null ? "" : ` ${status.percent}%`}
      </span>
    );
  }
  if (status.kind !== "available" || dismissed) return null;
  return (
    <span className="ml-auto">
      <span>Narada {status.version} is available</span> ·{" "}
      <button
        type="button"
        className={LINK}
        onClick={() => void useUpdateStore.getState().install()}
      >
        Update and restart
      </button>{" "}
      ·{" "}
      <button
        type="button"
        className="hover:underline"
        onClick={() => useUpdateStore.getState().dismiss()}
      >
        Later
      </button>
    </span>
  );
}
