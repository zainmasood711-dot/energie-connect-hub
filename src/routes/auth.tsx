import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ensureDemoAccounts, resolveEmailByIdentifier } from "@/lib/auth.functions";
import { getClientRoles } from "@/lib/auth-client";
import { roleHomePath } from "@/lib/roles";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام الصيانة الميدانية" },
      { name: "description", content: "تسجيل الدخول إلى نظام إدارة الصيانة والخدمة الميدانية للطاقة الشمسية." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const resolveIdentity = useServerFn(resolveEmailByIdentifier);
  const bootstrapDemoAccounts = useServerFn(ensureDemoAccounts);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("remember_identifier");
    if (cached) setIdentifier(cached);
  }, []);

  useEffect(() => {
    void bootstrapDemoAccounts().catch(() => {
      // no-op: login can still continue for non-demo users
    });
  }, [bootstrapDemoAccounts]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("يرجى إدخال بيانات الدخول كاملة");
      return;
    }

    setIsLoading(true);
    try {
      await bootstrapDemoAccounts();
      const { email } = await resolveIdentity({ data: { identifier: identifier.trim() } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("تعذر التحقق من المستخدم بعد تسجيل الدخول");

      const roles = await getClientRoles(userData.user.id);
      if (roles.length === 0) {
        toast.error("لا يوجد دور مخصص لهذا الحساب");
        await supabase.auth.signOut();
        return;
      }

      if (rememberMe) localStorage.setItem("remember_identifier", identifier.trim());
      else localStorage.removeItem("remember_identifier");

      const preferredRole = roles.includes("support_engineer")
        ? "support_engineer"
        : roles.includes("manager")
          ? "manager"
          : "field_engineer";

      toast.success("تم تسجيل الدخول بنجاح");
      await navigate({ to: roleHomePath[preferredRole], replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل تسجيل الدخول");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-lg border bg-card p-6 md:p-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">نظام إدارة الصيانة والخدمة الميدانية</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground md:text-base">
              منصة تشغيلية لشركات الطاقة الشمسية لإدارة المهندسين، المنتجات، ورموز الأعطال بسير عمل واضح ومناسب
              للفرق المكتبية والميدانية.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-foreground">
              <li>• إدارة موحدة للمهندسين الفنيين وحالات التوفر</li>
              <li>• قاعدة بيانات للفئات والعلامات والموديلات</li>
              <li>• توثيق رموز الأعطال والحلول المقترحة</li>
            </ul>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>تسجيل الدخول</CardTitle>
              <CardDescription>استخدم البريد الإلكتروني أو رقم الهاتف وكلمة المرور</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="identifier">البريد الإلكتروني أو رقم الهاتف</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="example@company.com أو 01000000000"
                    autoComplete="username"
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    dir="ltr"
                  />
                </div>

                <label className="flex items-center justify-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  تذكر بيانات الدخول
                </label>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري تسجيل الدخول...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      دخول
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}