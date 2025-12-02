import Navigation from "@/components/Navigation";

const Notes = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Notes</h1>
        {/* Add your notes UI here */}
      </main>
    </div>
  );
};

export default Notes;
