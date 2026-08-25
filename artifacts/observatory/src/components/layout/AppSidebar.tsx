import { Link, useLocation } from "wouter";
import {
  TerminalSquare,
  Database,
  History,
  Zap,
  ShieldCheck,
  BookOpen,
  Activity,
  Upload,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useHealthCheck } from "@workspace/api-client-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { data: health, isError } = useHealthCheck();

  const navItems = [
    { label: "Workbench", path: "/", icon: TerminalSquare },
    { label: "Vector Catalog", path: "/vectors", icon: Database },
    { label: "Run History", path: "/runs", icon: History },
    { label: "Import Bundle", path: "/imports", icon: Upload },
    { label: "Chaos Mode", path: "/chaos", icon: Zap },
    { label: "Verify Payload", path: "/verify", icon: ShieldCheck },
    { label: "Protocol Spec", path: "/protocol", icon: BookOpen },
  ];

  return (
    <Sidebar variant="sidebar" className="border-r border-border/50 bg-sidebar">
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight uppercase leading-none font-mono">
            Technocore
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            Gauntlet v0.9.1
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Instruments
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  location === item.path ||
                  (item.path !== "/" && location.startsWith(item.path));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        href={item.path}
                        className="flex items-center gap-3"
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="font-medium font-sans">
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs font-mono">
          <Activity
            className={`h-3 w-3 ${isError ? "text-destructive" : health?.status === "ok" ? "text-primary" : "text-muted-foreground"}`}
          />
          <span
            className={isError ? "text-destructive" : "text-muted-foreground"}
          >
            {isError
              ? "SYS_FAULT"
              : health?.status === "ok"
                ? "SYS_ONLINE"
                : "SYS_CONNECTING"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
