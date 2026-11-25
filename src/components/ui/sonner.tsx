import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/theme-context";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      {...props}
      theme={theme}
      position="top-right"
      offset={{ top: 72, right: 20 }}
      mobileOffset={{ top: 64, left: 16, right: 16 }}
      richColors={false}
      expand={true}
      gap={10}
      closeButton
      visibleToasts={4}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "inbox-toast group toast group-[.toaster]:text-foreground",
          title: "inbox-toast-title",
          description: "inbox-toast-description",
          actionButton: "inbox-toast-action",
          cancelButton: "inbox-toast-cancel",
        },
      }}
    />
  );
};

export { Toaster };
