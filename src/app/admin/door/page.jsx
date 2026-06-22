// /admin/door — entry point intercepted entirely by middleware.
// Middleware sets the gate cookie and redirects to the login page
// before this component ever renders.
export default function DoorPage() {
  return null;
}
