// See the tutorial again, from Help. 031.
//
// First run's intro over Help, presented as a modal, ending back where
// they were opened. The welcome screen does the drawing with `replay`, so the
// tutorial is one piece in both places.
import Welcome from "../components/screens/Welcome";

export default function Tutorial() {
  return <Welcome replay />;
}
