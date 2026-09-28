import { AccesosChecklists } from "@/components/AccesosChecklists";

export default function LayoutChecklists({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccesosChecklists />
      {children}
    </>
  );
}
