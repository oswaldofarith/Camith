"use client";

import { Cargando, ErrorCarga } from "@/components/common/Estado";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCatalogos } from "@/lib/api/hooks";

import { EditorCatalogos } from "./catalogos";
import { ConfiguracionGeneral } from "./general";
import { EditorLocalidades } from "./localidades";
import { EditorTiposTrabajo } from "./tipos-trabajo";

export default function ConfiguracionPage() {
  const catalogos = useCatalogos();
  return (
    <>
      <PageHeader title="Configuración" description="Parámetros de la empresa y catálogos del sistema." />
      {catalogos.isPending ? (
        <Cargando />
      ) : catalogos.isError ? (
        <ErrorCarga error={catalogos.error} />
      ) : (
        <Tabs defaultValue="general">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="catalogos">Catálogos</TabsTrigger>
            <TabsTrigger value="tipos-trabajo">Tipos de trabajo</TabsTrigger>
            <TabsTrigger value="localidades">Localidades</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <ConfiguracionGeneral inicial={catalogos.data.configuracion} />
          </TabsContent>
          <TabsContent value="catalogos">
            <EditorCatalogos catalogos={catalogos.data} />
          </TabsContent>
          <TabsContent value="tipos-trabajo">
            <EditorTiposTrabajo catalogos={catalogos.data} />
          </TabsContent>
          <TabsContent value="localidades">
            <EditorLocalidades catalogos={catalogos.data} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
