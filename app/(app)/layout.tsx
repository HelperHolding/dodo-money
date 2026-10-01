import Link from "next/link";
import { Marco } from "@/components/Marco";
import { obtenerContexto } from "@/lib/contexto";
import { hora } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { perfil, sucursal, turno, soloLectura } = await obtenerContexto();
  return (
    <Marco
      perfil={perfil}
      titulo={sucursal.nombre}
      detalle={turno ? `Turno ${turno.tipo} abierto desde las ${hora(turno.abierto_en)}` : "Sin turno abierto"}
      aviso={soloLectura && (
        <p className="franja-lectura">
          Viendo {sucursal.nombre} · Solo lectura · <Link href="/corporativo">Volver a corporativo</Link>
        </p>
      )}
    >
      {children}
    </Marco>
  );
}
