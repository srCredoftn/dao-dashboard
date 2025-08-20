import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskEditDialog from "./TaskEditDialog";
import { useAuth } from "@/contexts/AuthContext";
import type { DaoTask } from "@shared/dao";

interface AddTaskButtonProps {
  onTaskAdd: (
    newTask: Omit<DaoTask, "id" | "lastUpdatedAt" | "lastUpdatedBy">,
  ) => void;
  existingTaskIds: number[];
}

export default function AddTaskButton({
  onTaskAdd,
  existingTaskIds,
}: AddTaskButtonProps) {
  const { isAdmin } = useAuth();
  const [showDialog, setShowDialog] = useState(false);

  // Only show for admin users
  if (!isAdmin()) {
    return null;
  }

  const handleAddTask = (taskData: Partial<DaoTask>) => {
    // Generate new unique task ID
    const newId = Math.max(...existingTaskIds, 0) + 1;

    const newTask: Omit<DaoTask, "id" | "lastUpdatedAt" | "lastUpdatedBy"> = {
      name: taskData.name!,
      progress: taskData.isApplicable ? taskData.progress || null : null,
      comment: taskData.comment,
      isApplicable: taskData.isApplicable!,
      assignedTo: undefined,
    };

    onTaskAdd(newTask);
    setShowDialog(false);
  };

  return (
    <>
      <div className="flex justify-center pt-6 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <Plus className="h-4 w-4" />
          Ajouter une nouvelle tâche
        </Button>
      </div>

      <TaskEditDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSave={handleAddTask}
      />
    </>
  );
}
