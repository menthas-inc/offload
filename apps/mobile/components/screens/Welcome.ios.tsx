// First run on iOS. The flow is `components/firstrun/FirstRun.tsx`, one
// component for both phones with a tone; Metro picks this file by extension.
import { FirstRun } from "../firstrun/FirstRun";

export default function Welcome({ replay = false }: { replay?: boolean } = {}) {
  return <FirstRun tone="ios" replay={replay} />;
}
