import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Labs } from "./pages/Labs";
import { LabDetail } from "./pages/LabDetail";
import { Intro } from "./pages/Intro";
import { Toaster } from "./components/ui/Toaster";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 2 } },
});

function MainLayout() {
  return (
    <div style={{ background: "#080c18", minHeight: "100vh" }}>
      <Navbar />
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Intro — full screen, no navbar */}
          <Route path="/" element={<Intro />} />

          {/* App shell — all inner pages share Navbar */}
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/labs" element={<Labs />} />
            <Route path="/labs/:slug" element={<LabDetail />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
