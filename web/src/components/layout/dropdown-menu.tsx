import { forwardRef } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

// Radix menu, styled by ts-menu and ts-mi in shell.css. The ERP's version also has shadcn colour classes; they're
// left out because `accent` is orange in this app.
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className = '', sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={`z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overflow-x-hidden ${className}`}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className = '', ...props }, ref) {
  return <DropdownMenuPrimitive.Item ref={ref} className={`relative cursor-default select-none outline-none ${className}`} {...props} />;
});
