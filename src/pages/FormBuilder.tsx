import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchFormFields, replaceFormFieldOrder, saveFormField } from "@/lib/supabase-api";
import { deleteFormField, updateFormField } from "@/lib/supabase-api";
import type { AppRole, FormField } from "@/types/hospital";

const roleOptions: AppRole[] = ["admin", "director", "doctor", "nurse", "staff"];
const fieldTypes: FormField["field_type"][] = ["number", "text", "textarea", "select", "boolean", "date", "formula"];

const SortableFieldItem = ({
  field,
  onEdit,
  onDelete,
  isDeleting,
}: {
  field: FormField;
  onEdit: (field: FormField) => void;
  onDelete: (field: FormField) => void;
  isDeleting: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="hospital-transition flex items-center justify-between rounded-md border bg-card p-3"
    >
      <div>
        <p className="font-semibold">{field.label}</p>
        <p className="text-xs text-muted-foreground">
          {field.field_key} • {field.field_type} • {field.is_readonly ? "read-only" : "editable"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(field)}>
          Edit
        </Button>
        {field.is_system ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button type="button" variant="destructive" size="sm" disabled>
                  Delete
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>System fields are required and cannot be deleted.</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(field)} disabled={isDeleting}>
            Delete
          </Button>
        )}
        <button type="button" className="rounded border p-2" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const FormBuilderPage = () => {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor));

  const [draft, setDraft] = useState<Partial<FormField>>({
    id: undefined,
    field_key: "",
    label: "",
    field_type: "number",
    editable_roles: ["admin"],
    default_value: "",
    is_required: false,
    is_readonly: false,
  });
  const [fieldToDelete, setFieldToDelete] = useState<FormField | null>(null);

  const { data: fields = [] } = useQuery({ queryKey: ["form_fields"], queryFn: fetchFormFields });
  const sortedFields = useMemo(() => [...fields].sort((a, b) => a.display_order - b.display_order), [fields]);

  const saveMutation = useMutation({
    mutationFn: () =>
      (draft.id
        ? updateFormField(roles, draft.id, {
            field_key: String(draft.field_key || "").trim().toLowerCase().replace(/\s+/g, "_"),
            label: String(draft.label || "").trim(),
            field_type: (draft.field_type as FormField["field_type"]) || "number",
            is_required: Boolean(draft.is_required),
            is_readonly: Boolean(draft.is_readonly),
            is_system: false,
            is_active: true,
            default_value: (draft.default_value as string) || null,
            options: draft.options ?? [],
            editable_roles: (draft.editable_roles as AppRole[]) || ["admin"],
          })
        : saveFormField(roles, {
        field_key: String(draft.field_key || "").trim().toLowerCase().replace(/\s+/g, "_"),
        label: String(draft.label || "").trim(),
        field_type: (draft.field_type as FormField["field_type"]) || "number",
        is_required: Boolean(draft.is_required),
        is_readonly: Boolean(draft.is_readonly),
        is_system: false,
        is_active: true,
        display_order: sortedFields.length + 1,
        default_value: (draft.default_value as string) || null,
        options: draft.options ?? [],
        editable_roles: (draft.editable_roles as AppRole[]) || ["admin"],
      })),
    onSuccess: async () => {
      toast({ title: draft.id ? "Field updated" : "Field saved" });
      setDraft({ id: undefined, field_key: "", label: "", field_type: "number", editable_roles: ["admin"], default_value: "", is_required: false, is_readonly: false });
      await qc.invalidateQueries({ queryKey: ["form_fields"] });
    },
    onError: (error) => toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFormField(roles, id),
    onSuccess: async () => {
      toast({ title: "Field deleted" });
      await qc.invalidateQueries({ queryKey: ["form_fields"] });
    },
    onError: (error) => toast({ title: "Delete failed", description: (error as Error).message, variant: "destructive" }),
  });

  const onEdit = (field: FormField) => {
    setDraft({
      id: field.id,
      field_key: field.field_key,
      label: field.label,
      field_type: field.field_type,
      editable_roles: field.editable_roles,
      default_value: field.default_value ?? "",
      options: field.options,
      is_required: field.is_required,
      is_readonly: field.is_readonly,
      is_active: field.is_active,
      is_system: field.is_system,
      display_order: field.display_order,
    });
  };

  const onDelete = (field: FormField) => {
    if (field.is_system) return;
    setFieldToDelete(field);
  };

  const onConfirmDelete = () => {
    if (!fieldToDelete) return;
    deleteMutation.mutate(fieldToDelete.id, {
      onSettled: () => setFieldToDelete(null),
    });
    if (draft.id === fieldToDelete.id) {
      setDraft({ id: undefined, field_key: "", label: "", field_type: "number", editable_roles: ["admin"], default_value: "", is_required: false, is_readonly: false });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedFields.findIndex((f) => f.id === active.id);
    const newIndex = sortedFields.findIndex((f) => f.id === over.id);
    const reordered = arrayMove(sortedFields, oldIndex, newIndex);

    try {
      await replaceFormFieldOrder(roles, reordered.map((f) => f.id));
      await qc.invalidateQueries({ queryKey: ["form_fields"] });
      toast({ title: "Form order updated" });
    } catch (error) {
      toast({ title: "Reorder failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Dynamic Form Builder</h1>
        <p className="text-sm text-muted-foreground">Drag, reorder, and role-scope custom fields.</p>
      </header>

      <TooltipProvider>
        <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? "Edit Field" : "Add Field"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={String(draft.label || "")} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Field Key</Label>
              <Input value={String(draft.field_key || "")} onChange={(e) => setDraft((p) => ({ ...p, field_key: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select value={String(draft.field_type || "number")} onValueChange={(value) => setDraft((p) => ({ ...p, field_type: value as FormField["field_type"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Value</Label>
              <Input value={String(draft.default_value || "")} onChange={(e) => setDraft((p) => ({ ...p, default_value: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Editable Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {roleOptions.map((role) => {
                  const selected = (draft.editable_roles as AppRole[] | undefined)?.includes(role);
                  return (
                    <label key={role} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          setDraft((prev) => {
                            const list = (prev.editable_roles as AppRole[] | undefined) ?? [];
                            return {
                              ...prev,
                              editable_roles: checked ? [...new Set([...list, role])] : list.filter((r) => r !== role),
                            };
                          });
                        }}
                      />
                      {role}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(draft.is_required)}
                  onCheckedChange={(value) => setDraft((p) => ({ ...p, is_required: Boolean(value) }))}
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={Boolean(draft.is_readonly)}
                  onCheckedChange={(value) => setDraft((p) => ({ ...p, is_readonly: Boolean(value) }))}
                />
                Read-only
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {draft.id ? "Update Field" : "Save Field"}
              </Button>
              {draft.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDraft({ id: undefined, field_key: "", label: "", field_type: "number", editable_roles: ["admin"], default_value: "", is_required: false, is_readonly: false })}
                >
                  Cancel Edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Field Order</CardTitle>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
              <SortableContext items={sortedFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {sortedFields.map((field) => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      isDeleting={deleteMutation.isPending}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>

      <AlertDialog open={Boolean(fieldToDelete)} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this field?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. <span className="font-medium">{fieldToDelete?.label}</span> will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={onConfirmDelete}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default FormBuilderPage;
