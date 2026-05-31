import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { loginSchema } from "@/lib/validation";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/hospital-logo.png";
import bgImage from "@/assets/login-background.png";

const LoginPage = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const redirectPath = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      toast({ title: "Invalid credentials format", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await signIn(parsed.data.email, parsed.data.password);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      toast({ title: "Login failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <img
        src={bgImage}
        alt="Taif Children's Hospital login background"
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-border/60 bg-card/95 shadow-2xl backdrop-blur-sm">
          <CardHeader className="space-y-4 pb-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary p-2">
              <img src={logo} alt="Hospital logo" className="h-12 w-12 object-contain" loading="lazy" />
            </div>
            <div>
              <CardTitle className="text-2xl">Bed Management System</CardTitle>
              <CardDescription>Sign in with your authorized credentials</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-base">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@taifhospital.sa"
                  className="h-14 rounded-full border-primary/35 bg-secondary/40 px-5 text-base shadow-none"
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-base">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-14 rounded-full border-primary/35 bg-secondary/40 px-5 pr-12 text-base shadow-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <Button className="h-14 w-full rounded-full text-xl font-semibold" disabled={loading} type="submit">
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.section>
    </main>
  );
};

export default LoginPage;
