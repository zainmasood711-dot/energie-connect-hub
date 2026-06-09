import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

const resolveLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
});

type DemoAccount = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: "support_engineer" | "field_engineer" | "manager";
};

const demoAccounts: DemoAccount[] = [
  {
    email: "support.demo@energie.local",
    password: "Support@12345",
    fullName: "مهندس دعم تجريبي",
    phone: "01000000011",
    role: "support_engineer",
  },
  {
    email: "field.demo@energie.local",
    password: "Field@12345",
    fullName: "مهندس ميداني تجريبي",
    phone: "01000000022",
    role: "field_engineer",
  },
  {
    email: "manager.demo@energie.local",
    password: "Manager@12345",
    fullName: "مدير تجريبي",
    phone: "01000000033",
    role: "manager",
  },
];

async function findUserIdByEmail(
  supabaseAdmin: SupabaseClient<Database>,
  email: string,
) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`تعذر قراءة حسابات الدخول: ${error.message}`);

    const found = data.users.find((user: { email?: string | null; id?: string }) => user.email?.toLowerCase() === email.toLowerCase());
    if (found?.id) return found.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

export const resolveEmailByIdentifier = createServerFn({ method: "POST" })
  .inputValidator((input) => resolveLoginSchema.parse(input))
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (identifier.includes("@")) {
      return { email: identifier.toLowerCase() };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("phone", identifier)
      .maybeSingle();

    if (error) throw new Error("تعذر التحقق من بيانات تسجيل الدخول");
    if (!profile?.email) throw new Error("بيانات الدخول غير صحيحة");

    return { email: profile.email.toLowerCase() };
  });

export const ensureDemoAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let fieldEngineerId: string | null = null;
  const { data: fieldEngineer, error: fieldEngineerError } = await supabaseAdmin
    .from("engineers")
    .select("id")
    .eq("name", "م. حساب ميداني تجريبي")
    .maybeSingle();

  if (fieldEngineerError) throw new Error(`تعذر تجهيز المهندس الميداني التجريبي: ${fieldEngineerError.message}`);

  if (fieldEngineer?.id) {
    fieldEngineerId = fieldEngineer.id;
  } else {
    const { data: createdEngineer, error: createEngineerError } = await supabaseAdmin
      .from("engineers")
      .insert({
        name: "م. حساب ميداني تجريبي",
        type: "internal",
        availability_status: "available",
        governorate: "القاهرة",
        city: "مدينة نصر",
      })
      .select("id")
      .single();
    if (createEngineerError) throw new Error(`تعذر إنشاء المهندس الميداني التجريبي: ${createEngineerError.message}`);
    fieldEngineerId = createdEngineer.id;
  }

  for (const account of demoAccounts) {
    let userId = await findUserIdByEmail(supabaseAdmin, account.email);

    if (!userId) {
      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName },
      });
      if (createUserError) throw new Error(`تعذر إنشاء الحساب ${account.email}: ${createUserError.message}`);
      userId = createdUser.user.id;
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: account.fullName,
        email: account.email,
        phone: account.phone,
        engineer_id: account.role === "field_engineer" ? fieldEngineerId : null,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(`تعذر تحديث ملف الحساب ${account.email}: ${profileError.message}`);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: account.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(`تعذر ربط دور الحساب ${account.email}: ${roleError.message}`);
  }

  return {
    ok: true,
    accounts: demoAccounts.map((account) => ({
      email: account.email,
      phone: account.phone,
      role: account.role,
    })),
  };
});