import { NavLink } from "@/components/NavLink";

const Navigation = () => {
  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="font-semibold text-lg text-foreground">
            Trading Journal
          </div>
          <div className="flex items-center space-x-6">
            <NavLink
              to="/journal"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-foreground font-medium"
            >
              Journal
            </NavLink>
            <NavLink
              to="/trades"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-foreground font-medium"
            >
              Trades
            </NavLink>
            <NavLink
              to="/notes"
              className="text-muted-foreground hover:text-foreground transition-colors"
              activeClassName="text-foreground font-medium"
            >
              Notes
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
