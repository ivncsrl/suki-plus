import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}

const CategoryCombobox = ({ value, onChange, categories }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const trimmedSearch = search.trim();
  const showCreate = trimmedSearch.length > 0 && !categories.some(c => c.toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full h-11 justify-between font-normal text-sm">
          {value || <span className="text-muted-foreground">Category (optional)</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[70]" align="start">
        <Command>
          <CommandInput placeholder="Search category..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-sm text-muted-foreground">No categories found.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => { onChange(''); setOpen(false); setSearch(''); }}>
                  <span className="text-muted-foreground italic">Clear selection</span>
                </CommandItem>
              )}
              {categories.map(cat => (
                <CommandItem key={cat} value={cat} onSelect={() => { onChange(cat); setOpen(false); setSearch(''); }}>
                  <Check className={cn('mr-2 h-4 w-4', value === cat ? 'opacity-100' : 'opacity-0')} />
                  {cat}
                </CommandItem>
              ))}
            </CommandGroup>
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  onSelect={() => { onChange(trimmedSearch); setOpen(false); setSearch(''); }}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
