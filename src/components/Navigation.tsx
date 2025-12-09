import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const Navigation = () => {
  const { signOut } = useAuth();

  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="font-semibold text-lg text-foreground">Trading Journal</div>
          <div className="flex items-center space-x-4">
            <NavLink to="/journal" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Journal</NavLink>
            <NavLink to="/trades" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Trades</NavLink>
            <NavLink to="/ideas" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Ideas</NavLink>
            <NavLink to="/market-thoughts" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Market</NavLink>
            <NavLink to="/notes" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Notes</NavLink>
            <NavLink to="/analytics" className="text-muted-foreground hover:text-foreground transition-colors" activeClassName="text-foreground font-medium">Analytics</NavLink>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
