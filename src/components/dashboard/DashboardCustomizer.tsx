
import { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DashboardSection } from '@/hooks/useDashboardLayout';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Settings2, GripVertical, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DashboardCustomizerProps {
    sections: DashboardSection[];
    onReorder: (sections: DashboardSection[]) => void;
    onReset: () => void;
}

const SortableItem = ({ section }: { section: DashboardSection }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: section.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-3 p-3 bg-card border border-border rounded-lg mb-2 touch-none select-none",
                isDragging && "shadow-xl ring-2 ring-primary opacity-80"
            )}
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                <GripVertical className="w-5 h-5" />
            </div>
            <span className="font-medium text-sm">{section.label}</span>
        </div>
    );
};

export const DashboardCustomizer = ({ sections, onReorder, onReset }: DashboardCustomizerProps) => {
    const [open, setOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = sections.findIndex((s) => s.id === active.id);
            const newIndex = sections.findIndex((s) => s.id === over?.id);

            onReorder(arrayMove(sections, oldIndex, newIndex));
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 hidden md:flex">
                    <Settings2 className="w-4 h-4" />
                    <span>Customize Dashboard</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h4 className="font-semibold">Customize Layout</h4>
                    <Button variant="ghost" size="icon" onClick={onReset} title="Reset to Default">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
                <ScrollArea className="h-[300px] p-4">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sections.map(s => s.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {sections.map((section) => (
                                <SortableItem key={section.id} section={section} />
                            ))}
                        </SortableContext>
                    </DndContext>
                </ScrollArea>
                <div className="p-3 border-t border-border bg-muted/20 text-xs text-muted-foreground text-center">
                    Drag items to reorder logic
                </div>
            </PopoverContent>
        </Popover>
    );
};
