import { AdminOperations } from "./AdminOperations";

export default function Forbidden() {
  return <AdminOperations initialState="forbidden" />;
}