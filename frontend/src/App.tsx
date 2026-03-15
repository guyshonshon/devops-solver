import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Labs } from "./pages/Labs";
import { LabDetail } from "./pages/LabDetail";
import { Toaster } from "./components/ui/Toaster";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 2 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div style={{ background: "#080c18", minHeight: "100vh" }}>
          <Navbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/labs" element={<Labs />} />
            <Route path="/labs/:slug" element={<LabDetail />} />
          </Routes>
        </div>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
