import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  type Dao,
  calculateDaoStatus,
  calculateDaoProgress,
} from "@shared/dao";
// jsPDF import dynamique pour réduire la taille du bundle initial

type ExportFormat = "PDF" | "CSV";

interface GlobalExportOptions {
  includeCompleted: boolean;
  includeInProgress: boolean;
  includeAtRisk: boolean;
  format: ExportFormat;
}

interface GlobalExportDialogProps {
  daos: Dao[];
  children: React.ReactNode;
}

export default function GlobalExportDialog({
  daos,
  children,
}: GlobalExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<GlobalExportOptions>({
    includeCompleted: true,
    includeInProgress: true,
    includeAtRisk: true,
    format: "PDF",
  });

  // Calculer les statistiques des DAOs
  const completedDaos = daos.filter((dao) => {
    const progress = calculateDaoProgress(dao.tasks);
    const status = calculateDaoStatus(dao.dateDepot, progress);
    return status === "completed";
  });

  const inProgressDaos = daos.filter((dao) => {
    const progress = calculateDaoProgress(dao.tasks);
    const status = calculateDaoStatus(dao.dateDepot, progress);
    return status === "safe" || status === "default";
  });

  const atRiskDaos = daos.filter((dao) => {
    const progress = calculateDaoProgress(dao.tasks);
    const status = calculateDaoStatus(dao.dateDepot, progress);
    return status === "urgent";
  });

  const handleExport = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const filteredDaos = daos.filter((dao) => {
      const progress = calculateDaoProgress(dao.tasks);
      const status = calculateDaoStatus(dao.dateDepot, progress);

      if (status === "completed" && !options.includeCompleted) return false;
      if (status === "urgent" && !options.includeAtRisk) return false;
      if (
        (status === "safe" || status === "default") &&
        !options.includeInProgress
      )
        return false;

      return true;
    });

    if (options.format === "PDF") {
      exportToPDF(filteredDaos);
    } else {
      exportToCSV(filteredDaos);
    }

    setIsOpen(false);
  };

  const exportToPDF = async (filteredDaos: Dao[]) => {
    // Import dynamique de jsPDF pour réduire la taille du bundle initial
    const { default: jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = margin;

    // Configuration des polices
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);

    // Titre principal
    pdf.text("Export Global des DAOs", margin, yPosition);
    yPosition += 15;

    // Date d'export
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Date d'export: ${new Date().toLocaleDateString("fr-FR")}`,
      margin,
      yPosition,
    );
    yPosition += 10;

    // Statistiques
    pdf.setFont("helvetica", "bold");
    pdf.text("Statistiques:", margin, yPosition);
    yPosition += 8;

    pdf.setFont("helvetica", "normal");
    const stats = [
      `• Total de DAOs exportés: ${filteredDaos.length}`,
      `• DAOs terminés: ${filteredDaos.filter((d) => calculateDaoStatus(d.dateDepot, calculateDaoProgress(d.tasks)) === "completed").length}`,
      `• DAOs en cours: ${
        filteredDaos.filter((d) => {
          const status = calculateDaoStatus(
            d.dateDepot,
            calculateDaoProgress(d.tasks),
          );
          return status === "safe" || status === "default";
        }).length
      }`,
      `• DAOs à risque: ${filteredDaos.filter((d) => calculateDaoStatus(d.dateDepot, calculateDaoProgress(d.tasks)) === "urgent").length}`,
    ];

    stats.forEach((stat) => {
      pdf.text(stat, margin + 5, yPosition);
      yPosition += 7;
    });

    yPosition += 10;

    // Liste des DAOs
    pdf.setFont("helvetica", "bold");
    pdf.text("Liste des DAOs:", margin, yPosition);
    yPosition += 10;

    filteredDaos.forEach((dao, index) => {
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = margin;
      }

      const progress = calculateDaoProgress(dao.tasks);
      const status = calculateDaoStatus(dao.dateDepot, progress);

      let statusText = "";
      switch (status) {
        case "completed":
          statusText = "Terminé";
          break;
        case "urgent":
          statusText = "À risque";
          break;
        case "safe":
          statusText = "En cours (sûr)";
          break;
        case "default":
          statusText = "En cours";
          break;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(`${index + 1}. ${dao.numeroListe}`, margin, yPosition);
      yPosition += 7;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const daoLines = [
        `   Objet: ${dao.objetDossier}`,
        `   Référence: ${dao.reference}`,
        `   Autorité: ${dao.autoriteContractante}`,
        `   Date de dépôt: ${dao.dateDepot}`,
        `   Statut: ${statusText}`,
        `   Progression: ${progress}%`,
        `   Chef d'équipe: ${dao.equipe.find((m) => m.role === "chef_equipe")?.name || "Non assigné"}`,
      ];

      daoLines.forEach((line) => {
        const splitLines = pdf.splitTextToSize(
          line,
          pageWidth - 2 * margin - 10,
        );
        splitLines.forEach((splitLine: string) => {
          if (yPosition > 280) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(splitLine, margin + 5, yPosition);
          yPosition += 6;
        });
      });

      yPosition += 8;
    });

    // Sauvegarder le PDF
    pdf.save(`export_daos_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportToCSV = (filteredDaos: Dao[]) => {
    const csvContent = [
      [
        "Numéro DAO",
        "Objet",
        "Référence",
        "Autorité",
        "Date de dépôt",
        "Statut",
        "Progression (%)",
        "Chef d'équipe",
        "Membres d'équipe",
      ],
      ...filteredDaos.map((dao) => {
        const progress = calculateDaoProgress(dao.tasks);
        const status = calculateDaoStatus(dao.dateDepot, progress);

        let statusText = "";
        switch (status) {
          case "completed":
            statusText = "Terminé";
            break;
          case "urgent":
            statusText = "À risque";
            break;
          case "safe":
            statusText = "En cours (sûr)";
            break;
          case "default":
            statusText = "En cours";
            break;
        }

        const chef =
          dao.equipe.find((m) => m.role === "chef_equipe")?.name ||
          "Non assigné";
        const membres = dao.equipe
          .filter((m) => m.role === "membre_equipe")
          .map((m) => m.name)
          .join("; ");

        return [
          dao.numeroListe,
          dao.objetDossier,
          dao.reference,
          dao.autoriteContractante,
          dao.dateDepot,
          statusText,
          progress.toString(),
          chef,
          membres,
        ];
      }),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_daos_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFormatChange = (format: ExportFormat) => {
    setOptions((prev) => ({ ...prev, format }));
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const getSelectedDaosCount = () => {
    let count = 0;
    if (options.includeCompleted) count += completedDaos.length;
    if (options.includeInProgress) count += inProgressDaos.length;
    if (options.includeAtRisk) count += atRiskDaos.length;
    return count;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Global des DAOs
          </DialogTitle>
          <DialogDescription>
            Exportez tous les DAOs selon leur statut au format PDF ou CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Format d'export</h4>
            <div className="flex gap-2">
              <Button
                variant={options.format === "PDF" ? "default" : "outline"}
                size="sm"
                onClick={() => handleFormatChange("PDF")}
                className="flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button
                variant={options.format === "CSV" ? "default" : "outline"}
                size="sm"
                onClick={() => handleFormatChange("CSV")}
                className="flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>

          <Separator />

          {/* Status Filters */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Statut des DAOs à inclure</h4>

            <div className="space-y-3">
              {/* Termin��s */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="completed"
                    checked={options.includeCompleted}
                    onCheckedChange={(checked) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeCompleted: checked as boolean,
                      }))
                    }
                  />
                  <label
                    htmlFor="completed"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Terminés
                  </label>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs bg-dao-completed text-white"
                >
                  {completedDaos.length}
                </Badge>
              </div>

              {/* En cours */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="inprogress"
                    checked={options.includeInProgress}
                    onCheckedChange={(checked) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeInProgress: checked as boolean,
                      }))
                    }
                  />
                  <label
                    htmlFor="inprogress"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    En cours
                  </label>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs bg-dao-safe text-white"
                >
                  {inProgressDaos.length}
                </Badge>
              </div>

              {/* À risque */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="atrisk"
                    checked={options.includeAtRisk}
                    onCheckedChange={(checked) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeAtRisk: checked as boolean,
                      }))
                    }
                  />
                  <label
                    htmlFor="atrisk"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    À risque
                  </label>
                </div>
                <Badge
                  variant="secondary"
                  className="text-xs bg-dao-urgent text-white"
                >
                  {atRiskDaos.length}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">DAOs sélectionnés:</span>
              <span className="font-medium">
                {getSelectedDaosCount()} / {daos.length}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleExport}
            disabled={getSelectedDaosCount() === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exporter {options.format}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { GlobalExportOptions };
