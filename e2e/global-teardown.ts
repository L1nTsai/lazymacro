import { removeTestData } from "./helpers";

export default function globalTeardown() {
  removeTestData();
}
