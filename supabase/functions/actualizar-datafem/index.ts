import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0";

const DATAFEM_URL = "https://datafem.com.ar/primera-b";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json(
      { error: "Método no permitido. Usá POST." },
      { status: 405 },
    );
  }

  const expectedSecret = Deno.env.get("DATAFEM_CRON_SECRET");
  const receivedSecret = req.headers.get("x-datafem-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(DATAFEM_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 ComunicacionesDataFem/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`DataFem respondió con estado ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    function obtenerTabla(nombre: string) {
      const encabezado = $("h1, h2, h3, h4")
        .filter((_, el) =>
          $(el).text().trim().toLowerCase() === nombre.toLowerCase()
        )
        .first();

      if (!encabezado.length) {
        throw new Error(`No se encontró el encabezado "${nombre}".`);
      }

      let tabla = encabezado.nextAll("table").first();

      if (!tabla.length) {
        tabla = encabezado.parent().nextAll("table").first();
      }

      if (!tabla.length) {
        tabla = encabezado.parent().parent().find("table").first();
      }

      if (!tabla.length) {
        throw new Error(`No se encontró la tabla de "${nombre}".`);
      }

      const filas: Record<string, string | number>[] = [];

      tabla.find("tr").each((_, fila) => {
        const celdas = $(fila)
          .find("th, td")
          .map((_, celda) => $(celda).text().replace(/\s+/g, " ").trim())
          .get();

        if (celdas.length < 8) return;

        const valores = celdas.map((v) =>
          Number(v.replace(",", "."))
        );

        const [posicion, equipo, puntos, pj, pg, pe, pp, dg] = celdas;

        // Ignorar encabezados y filas que no sean datos válidos.
        if (
          !posicion ||
          !equipo ||
          !Number.isFinite(valores[0]) ||
          !Number.isFinite(valores[2]) ||
          !Number.isFinite(valores[3]) ||
          !Number.isFinite(valores[4]) ||
          !Number.isFinite(valores[5]) ||
          !Number.isFinite(valores[6]) ||
          !Number.isFinite(valores[7])
        ) return;

        filas.push({
          posicion: Number(posicion),
          equipo,
          puntos: Number(puntos),
          partidos: Number(pj),
          ganados: Number(pg),
          empatados: Number(pe),
          perdidos: Number(pp),
          diferencia: Number(dg),
        });
      });

      if (filas.length === 0) {
        throw new Error(`No se pudieron leer filas de "${nombre}".`);
      }

      return filas;
    }

    const zonaA = obtenerTabla("Zona A");
    const zonaB = obtenerTabla("Zona B");
    const general = obtenerTabla("Tabla General");

    // Comprobar que las tablas tengan una estructura razonable.
    if (
      zonaA.length < 2 ||
      zonaB.length < 2 ||
      general.length < 2
    ) {
      throw new Error("Una o más tablas están incompletas.");
    }

    if (
      !zonaB.some((fila) =>
        String(fila.equipo).toLowerCase().includes("comunicaciones")
      )
    ) {
      throw new Error(
        "No se encontró Comunicaciones en Zona B. Se conservan los datos anteriores.",
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { error } = await supabase
      .from("datafem_tablas")
      .upsert(
        {
          id: 1,
          zona_a: zonaA,
          zona_b: zonaB,
          general,
          updated_at: new Date().toISOString(),
          source_url: DATAFEM_URL,
        },
        { onConflict: "id" },
      );

    if (error) throw error;

    return Response.json({
      ok: true,
      mensaje: "Tablas de DataFem actualizadas.",
      cantidad: {
        zona_a: zonaA.length,
        zona_b: zonaB.length,
        general: general.length,
      },
    });
  } catch (error) {
    console.error("Error actualizando DataFem:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : "Error desconocido.",
      },
      { status: 500 },
    );
  }
});
