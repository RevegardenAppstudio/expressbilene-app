"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, vehicleLabel, type Department, type Route, type UserRole, type Vehicle } from "@/lib/types";
import { logAuditEvent } from "@/lib/auditLog";
import ReasonDialog from "@/components/ReasonDialog";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  deactivated_at: string | null;
  status: "aktiv" | "invitert" | "deaktivert";
};

type SubView = "ruter" | "ansatte" | "biler";

export default function AvdelingerPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [myRole, setMyRole] = useState<UserRole | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>("ruter");
  const [showOverview, setShowOverview] = useState(false);
  const [overviewTab, setOverviewTab] = useState<"ansatte" | "biler">("ansatte");
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMoveEmployee, setShowMoveEmployee] = useState(false);
  const [showOverviewInvite, setShowOverviewInvite] = useState(false);
  const [showOverviewAddVehicle, setShowOverviewAddVehicle] = useState(false);
  const [overviewInviteDepartmentId, setOverviewInviteDepartmentId] = useState("");
  const [overviewVehicleDepartmentId, setOverviewVehicleDepartmentId] = useState("");

  const [newDepartment, setNewDepartment] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [newVehicle, setNewVehicle] = useState("");
  const [newVehicleMake, setNewVehicleMake] = useState("");
  const [addEmployeeId, setAddEmployeeId] = useState("");
  const [addVehicleId, setAddVehicleId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [vehicleQuery, setVehicleQuery] = useState("");

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("sjafor");
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editRouteName, setEditRouteName] = useState("");
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicleName, setEditVehicleName] = useState("");
  const [editVehicleMake, setEditVehicleMake] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("sjafor");
  const [pendingSaveUserId, setPendingSaveUserId] = useState<string | null>(null);
  const [pendingDeactivateUser, setPendingDeactivateUser] = useState<{ id: string; name: string; deactivate: boolean } | null>(
    null
  );

  const [pendingResetPasswordUser, setPendingResetPasswordUser] = useState<{ id: string; name: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [pendingDeleteDepartment, setPendingDeleteDepartment] = useState<string | null>(null);
  const [pendingDeleteRoute, setPendingDeleteRoute] = useState<string | null>(null);
  const [pendingDeleteVehicle, setPendingDeleteVehicle] = useState<string | null>(null);
  const [pendingEmployeeChange, setPendingEmployeeChange] = useState<{ userId: string; departmentId: string | null } | null>(null);
  const [pendingVehicleChange, setPendingVehicleChange] = useState<{ vehicleId: string; departmentId: string | null } | null>(null);

  const isAdmin = myRole === "admin";
  const isModerator = myRole === "moderator";

  const loadActiveUsers = useCallback(async () => {
    const { data: activeData } = await supabase.from("time_entries").select("user_id").not("clock_in", "is", null).is("clock_out", null);
    if (activeData) setActiveUserIds(new Set((activeData as { user_id: string }[]).map((e) => e.user_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: me }, { data: deps }, { data: rts }, { data: vhs }, { data: userData, error: userError }] = await Promise.all([
      supabase.from("profiles").select("role, department_id").eq("id", user.id).single(),
      supabase.from("departments").select("*").order("name"),
      supabase.from("routes").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.functions.invoke("admin-list-users"),
    ]);

    if (me) {
      setMyRole(me.role as UserRole);
    }
    if (deps) setDepartments(deps as Department[]);
    if (rts) setRoutes(rts as Route[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    if (!userError) setUsers((userData?.users ?? []) as AdminUserRow[]);
    await loadActiveUsers();
    setLoading(false);
  }, [supabase, loadActiveUsers]);

  useEffect(() => {
    load();
  }, [load]);

  // Hvem som er klokket inn nå oppdateres i sanntid via Supabase Realtime,
  // ikke bare ved manuell refresh -- speiler samme oppsett som Kalender.
  useEffect(() => {
    const channel = supabase
      .channel("avdelinger-active-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => {
        loadActiveUsers();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadActiveUsers]);

  function openDepartment(id: string) {
    setSelectedDepartmentId(id);
    setSubView("ruter");
  }

  function goBackToDepartments() {
    setSelectedDepartmentId(null);
    setSubView("ruter");
  }

  async function handleAddDepartment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newDepartment.trim()) return;
    const { data, error } = await supabase.from("departments").insert({ name: newDepartment.trim() }).select().single();
    if (error || !data) {
      setError(t("avdelinger.addDeptFailed"));
      showToast(t("avdelinger.addDeptFailed"), "error");
      return;
    }
    setDepartments((prev) => [...prev, data as Department].sort((a, b) => a.name.localeCompare(b.name)));
    setNewDepartment("");
    setShowAddDepartment(false);
    showToast(t("avdelinger.deptAdded"));
  }

  async function confirmDeleteDepartment() {
    const id = pendingDeleteDepartment;
    setPendingDeleteDepartment(null);
    if (!id) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (!error) {
      setDepartments((prev) => prev.filter((d) => d.id !== id));
      setRoutes((prev) => prev.map((r) => (r.department_id === id ? { ...r, department_id: null } : r)));
      setVehicles((prev) => prev.map((v) => (v.department_id === id ? { ...v, department_id: null } : v)));
      setUsers((prev) => prev.map((u) => (u.department_id === id ? { ...u, department_id: null } : u)));
      goBackToDepartments();
      showToast(t("avdelinger.deptDeleted"));
    } else {
      showToast(t("avdelinger.deleteDeptFailed"), "error");
    }
  }

  async function handleAddRoute(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newRoute.trim() || !selectedDepartmentId) return;
    const { data, error } = await supabase
      .from("routes")
      .insert({ name: newRoute.trim(), department_id: selectedDepartmentId })
      .select()
      .single();
    if (error || !data) {
      setError(t("avdelinger.addRouteFailed"));
      showToast(t("avdelinger.addRouteFailed"), "error");
      return;
    }
    setRoutes((prev) => [...prev, data as Route].sort((a, b) => a.name.localeCompare(b.name)));
    setNewRoute("");
    setShowAddRoute(false);
    showToast(t("avdelinger.routeAdded"));
  }

  async function confirmDeleteRoute() {
    const id = pendingDeleteRoute;
    setPendingDeleteRoute(null);
    if (!id) return;
    const { error } = await supabase.from("routes").delete().eq("id", id);
    if (!error) {
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      showToast(t("avdelinger.routeDeleted"));
    } else {
      showToast(t("avdelinger.deleteRouteFailed"), "error");
    }
  }

  function startEditRoute(r: Route) {
    setEditingRouteId(r.id);
    setEditRouteName(r.name);
  }

  async function confirmSaveRoute() {
    if (!editingRouteId || !editRouteName.trim()) return;
    const trimmed = editRouteName.trim();
    const { error } = await supabase.from("routes").update({ name: trimmed }).eq("id", editingRouteId);
    if (error) {
      showToast(t("avdelinger.saveRouteFailed"), "error");
      return;
    }
    setRoutes((prev) => prev.map((r) => (r.id === editingRouteId ? { ...r, name: trimmed } : r)));
    setEditingRouteId(null);
    showToast(t("avdelinger.routeUpdated"));
  }

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const targetDepartmentId = selectedDepartmentId ?? overviewVehicleDepartmentId;
    if (!newVehicle.trim() || !targetDepartmentId) return;
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ name: newVehicle.trim(), make: newVehicleMake.trim() || null, department_id: targetDepartmentId })
      .select()
      .single();
    if (error || !data) {
      setError(t("avdelinger.addVehicleFailed"));
      showToast(t("avdelinger.addVehicleFailed"), "error");
      return;
    }
    setVehicles((prev) => [...prev, data as Vehicle].sort((a, b) => a.name.localeCompare(b.name)));
    setNewVehicle("");
    setNewVehicleMake("");
    setOverviewVehicleDepartmentId("");
    setShowAddVehicle(false);
    setShowOverviewAddVehicle(false);
    showToast(t("avdelinger.vehicleAdded"));
  }

  async function confirmDeleteVehicle() {
    const id = pendingDeleteVehicle;
    setPendingDeleteVehicle(null);
    if (!id) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (!error) {
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      showToast(t("avdelinger.vehicleDeleted"));
    } else {
      showToast(t("avdelinger.deleteVehicleFailed"), "error");
    }
  }

  function startEditVehicle(v: Vehicle) {
    setEditingVehicleId(v.id);
    setEditVehicleName(v.name);
    setEditVehicleMake(v.make ?? "");
  }

  async function confirmSaveVehicle() {
    if (!editingVehicleId || !editVehicleName.trim()) return;
    const trimmedName = editVehicleName.trim();
    const trimmedMake = editVehicleMake.trim() || null;
    const { error } = await supabase
      .from("vehicles")
      .update({ name: trimmedName, make: trimmedMake })
      .eq("id", editingVehicleId);
    if (error) {
      showToast(t("avdelinger.saveVehicleFailed"), "error");
      return;
    }
    setVehicles((prev) => prev.map((v) => (v.id === editingVehicleId ? { ...v, name: trimmedName, make: trimmedMake } : v)));
    setEditingVehicleId(null);
    showToast(t("avdelinger.vehicleUpdated"));
  }

  async function confirmEmployeeChange(reason: string) {
    const change = pendingEmployeeChange;
    setPendingEmployeeChange(null);
    if (!change) return;
    const { error } = await supabase.functions.invoke("admin-update-user", {
      body: { user_id: change.userId, department_id: change.departmentId, reason: reason || undefined },
    });
    if (error) {
      setError(t("avdelinger.updateEmployeeDeptFailed"));
      showToast(t("avdelinger.updateEmployeeDeptFailed"), "error");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === change.userId ? { ...u, department_id: change.departmentId } : u)));
    setAddEmployeeId("");
    setEmployeeQuery("");
    if (change.departmentId) setShowMoveEmployee(false);
    showToast(change.departmentId ? t("avdelinger.employeeAddedToDept") : t("avdelinger.employeeRemovedFromDept"));
  }

  async function confirmVehicleChange(reason: string) {
    const change = pendingVehicleChange;
    setPendingVehicleChange(null);
    if (!change) return;

    const vehicle = vehicles.find((v) => v.id === change.vehicleId);
    const targetDept = change.departmentId ? departments.find((d) => d.id === change.departmentId)?.name : null;

    const { error } = await supabase.from("vehicles").update({ department_id: change.departmentId }).eq("id", change.vehicleId);
    if (error) {
      setError(t("avdelinger.updateVehicleDeptFailed"));
      showToast(t("avdelinger.updateVehicleDeptFailed"), "error");
      return;
    }

    await logAuditEvent(supabase, {
      action: "vehicle.moved",
      targetType: "vehicles",
      targetId: change.vehicleId,
      reason,
      details: targetDept
        ? `${vehicleLabel(vehicle ?? { name: "Bil", make: null })} flyttet til ${targetDept}`
        : `${vehicleLabel(vehicle ?? { name: "Bil", make: null })} fjernet fra avdeling`,
    });

    setVehicles((prev) => prev.map((v) => (v.id === change.vehicleId ? { ...v, department_id: change.departmentId } : v)));
    setAddVehicleId("");
    setVehicleQuery("");
    if (change.departmentId) setShowAddVehicle(false);
    showToast(change.departmentId ? t("avdelinger.vehicleAddedToDept") : t("avdelinger.vehicleRemovedFromDept"));
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteMessage(null);
    setInviting(true);

    const targetDepartmentId = selectedDepartmentId ?? (overviewInviteDepartmentId || null);

    const { data, error } = await supabase.functions.invoke("invite-user", {
      body: { full_name: inviteName, email: inviteEmail, role: inviteRole, department_id: targetDepartmentId },
    });

    setInviting(false);
    if (error) {
      let msg = t("avdelinger.inviteFailed");
      if ("context" in error && error.context instanceof Response) {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch {
          // Svaret var ikke JSON -- bruker den generiske meldingen.
        }
      }
      setError(msg);
      showToast(msg, "error");
      return;
    }

    const newUserId = data?.user?.id as string | undefined;
    if (newUserId) {
      setUsers((prev) =>
        [
          ...prev,
          {
            id: newUserId,
            email: inviteEmail,
            full_name: inviteName,
            role: inviteRole,
            department_id: targetDepartmentId,
            deactivated_at: null,
            status: "invitert" as const,
          },
        ].sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
    }

    setInviteMessage(t("avdelinger.inviteSent", { email: inviteEmail }));
    showToast(t("avdelinger.inviteSent", { email: inviteEmail }));
    setInviteName("");
    setInviteEmail("");
    setInviteRole("sjafor");
    setOverviewInviteDepartmentId("");
    setShowInvite(false);
    setShowOverviewInvite(false);
  }

  function startEditUser(u: AdminUserRow) {
    setEditingUserId(u.id);
    setEditName(u.full_name);
    setEditRole(u.role);
  }

  async function confirmSaveUserEdit(reason: string) {
    const userId = pendingSaveUserId;
    setPendingSaveUserId(null);
    if (!userId) return;
    const { error } = await supabase.functions.invoke("admin-update-user", {
      body: { user_id: userId, full_name: editName, role: editRole, reason: reason || undefined },
    });
    if (error) {
      setError(t("avdelinger.saveUserFailed"));
      showToast(t("avdelinger.saveUserFailed"), "error");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, full_name: editName, role: editRole } : u)));
    setEditingUserId(null);
    showToast(t("avdelinger.userUpdated"));
  }

  async function confirmToggleDeactivate(reason: string) {
    const target = pendingDeactivateUser;
    setPendingDeactivateUser(null);
    if (!target) return;
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: { user_id: target.id, deactivate: target.deactivate, reason: reason || undefined },
    });
    if (error) {
      showToast(t(target.deactivate ? "avdelinger.deactivateUserFailed" : "avdelinger.reactivateUserFailed"), "error");
      return;
    }
    if (data?.deleted) {
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      showToast(t("avdelinger.userDeleted", { name: target.name }));
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === target.id
          ? {
              ...u,
              deactivated_at: target.deactivate ? new Date().toISOString() : null,
              status: target.deactivate ? "deaktivert" : u.status === "deaktivert" ? "aktiv" : u.status,
            }
          : u
      )
    );
    showToast(t(target.deactivate ? "avdelinger.userDeactivated" : "avdelinger.userReactivated", { name: target.name }));
  }

  async function confirmResetPassword() {
    const target = pendingResetPasswordUser;
    if (!target) return;
    if (resetPasswordValue.length < 8) {
      setResetPasswordError(t("avdelinger.resetPasswordTooShort"));
      return;
    }
    setResettingPassword(true);
    setResetPasswordError(null);
    const { error } = await supabase.functions.invoke("reset-user-password", {
      body: { user_id: target.id, new_password: resetPasswordValue },
    });
    setResettingPassword(false);
    if (error) {
      let msg = t("avdelinger.resetPasswordFailed");
      if ("context" in error && error.context instanceof Response) {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch {
          // Svaret var ikke JSON -- bruker den generiske meldingen.
        }
      }
      setResetPasswordError(msg);
      showToast(msg, "error");
      return;
    }
    showToast(t("avdelinger.resetPasswordSuccess", { name: target.name }));
    setPendingResetPasswordUser(null);
    setResetPasswordValue("");
  }

  const resetPasswordModal = pendingResetPasswordUser && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => setPendingResetPasswordUser(null)}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">
          {t("avdelinger.resetPasswordTitle", { name: pendingResetPasswordUser.name })}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t("avdelinger.resetPasswordMessage")}</p>

        <label className="mb-1 mt-4 block text-xs font-medium text-slate-600">{t("avdelinger.newPassword")}</label>
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={resetPasswordValue}
            onChange={(e) => setResetPasswordValue(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="button"
            onClick={() => setResetPasswordValue(Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6))}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("avdelinger.generatePassword")}
          </button>
        </div>
        {resetPasswordError && <p className="mt-1 text-xs text-red-600">{resetPasswordError}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setPendingResetPasswordUser(null)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("reasonDialog.cancel")}
          </button>
          <button
            onClick={confirmResetPassword}
            disabled={resettingPassword}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
          >
            {resettingPassword ? t("common.saving") : t("avdelinger.resetPassword")}
          </button>
        </div>
      </div>
    </div>
  );

  const routeCount = (departmentId: string | null) => routes.filter((r) => r.department_id === departmentId).length;
  const vehicleCount = (departmentId: string | null) => vehicles.filter((v) => v.department_id === departmentId).length;
  const employeeCount = (departmentId: string | null) => users.filter((u) => u.department_id === departmentId).length;

  const selectedDepartment = selectedDepartmentId ? departments.find((d) => d.id === selectedDepartmentId) : null;
  const departmentLabel = selectedDepartment?.name ?? "";

  const selectedRoutes = routes.filter((r) => r.department_id === selectedDepartmentId);
  const selectedVehicles = vehicles.filter((v) => v.department_id === selectedDepartmentId);
  const selectedEmployees = users.filter((u) => u.department_id === selectedDepartmentId);
  const employeesNotInDepartment = users.filter((u) => u.department_id !== selectedDepartmentId);
  const vehiclesNotInDepartment = vehicles.filter((v) => v.department_id !== selectedDepartmentId);

  function handleEmployeeQueryChange(value: string) {
    setEmployeeQuery(value);
    const match = employeesNotInDepartment.find((u) => u.full_name.toLowerCase() === value.trim().toLowerCase());
    setAddEmployeeId(match?.id ?? "");
  }

  function handleVehicleQueryChange(value: string) {
    setVehicleQuery(value);
    const match = vehiclesNotInDepartment.find((v) => vehicleLabel(v).toLowerCase() === value.trim().toLowerCase());
    setAddVehicleId(match?.id ?? "");
  }

  if (loading) {
    return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  }

  // ============ Avdelingsvisning: felles header + faner for Ruter / Biler / Ansatte ============
  if (selectedDepartmentId) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={goBackToDepartments} className="mb-2 text-sm text-slate-500 hover:text-brand-dark">
            {t("avdelinger.backToDepartments")}
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900">{departmentLabel}</h1>
            {isAdmin && (
              <button onClick={() => setPendingDeleteDepartment(selectedDepartmentId)} className="text-xs text-slate-400 hover:text-red-600">
                {t("avdelinger.deleteDepartment")}
              </button>
            )}
          </div>
        </div>

        <div className="flex w-fit gap-1 rounded-md bg-slate-100 p-1 text-sm">
          <button
            onClick={() => setSubView("ruter")}
            className={`rounded px-4 py-1.5 font-medium transition-colors ${
              subView === "ruter" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("avdelinger.routesCard")} ({routeCount(selectedDepartmentId)})
          </button>
          <button
            onClick={() => setSubView("biler")}
            className={`rounded px-4 py-1.5 font-medium transition-colors ${
              subView === "biler" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("avdelinger.vehiclesCard")} ({vehicleCount(selectedDepartmentId)})
          </button>
          <button
            onClick={() => setSubView("ansatte")}
            className={`rounded px-4 py-1.5 font-medium transition-colors ${
              subView === "ansatte" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("avdelinger.employeesCard")} ({employeeCount(selectedDepartmentId)})
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {subView === "ruter" && (
          <>
            {isAdmin && (
              <div>
                <button
                  onClick={() => setShowAddRoute((v) => !v)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t("avdelinger.showAddRoute")}
                </button>
                {showAddRoute && (
                  <form onSubmit={handleAddRoute} className="mt-3 flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newRoute}
                      onChange={(e) => setNewRoute(e.target.value)}
                      placeholder={t("avdelinger.routeNamePlaceholder")}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90">
                      {t("avdelinger.addRoute")}
                    </button>
                  </form>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {selectedRoutes.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">{t("avdelinger.noRoutes")}</p>
              ) : (
                selectedRoutes.map((r) =>
                  editingRouteId === r.id ? (
                    <div key={r.id} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm last:border-0">
                      <input
                        autoFocus
                        value={editRouteName}
                        onChange={(e) => setEditRouteName(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button onClick={confirmSaveRoute} className="text-xs font-medium text-brand-dark">
                        {t("common.save")}
                      </button>
                      <button onClick={() => setEditingRouteId(null)} className="text-xs text-slate-400">
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div key={r.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm last:border-0">
                      <span>{r.name}</span>
                      {isAdmin && (
                        <div className="flex gap-3">
                          <button onClick={() => startEditRoute(r)} className="text-xs text-slate-400 hover:text-brand-dark">
                            {t("common.edit")}
                          </button>
                          <button onClick={() => setPendingDeleteRoute(r.id)} className="text-xs text-slate-400 hover:text-red-600">
                            {t("common.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )
              )}
            </div>
          </>
        )}

        {subView === "biler" && (
          <>
            {isAdmin && (
              <div>
                <button
                  onClick={() => setShowAddVehicle((v) => !v)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t("avdelinger.showAddVehicle")}
                </button>
                {showAddVehicle && (
                  <div className="mt-3 space-y-3">
                    <form onSubmit={handleAddVehicle} className="flex flex-wrap gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={newVehicleMake}
                        onChange={(e) => setNewVehicleMake(e.target.value)}
                        placeholder={t("avdelinger.vehicleMakePlaceholder")}
                        className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={newVehicle}
                        onChange={(e) => setNewVehicle(e.target.value)}
                        placeholder={t("avdelinger.vehiclePlatePlaceholder")}
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90">
                        {t("avdelinger.addVehicle")}
                      </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        list="vehicles-not-in-department"
                        value={vehicleQuery}
                        onChange={(e) => handleVehicleQueryChange(e.target.value)}
                        placeholder={t("avdelinger.moveVehiclePlaceholder")}
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                      <datalist id="vehicles-not-in-department">
                        {vehiclesNotInDepartment.map((v) => (
                          <option key={v.id} value={vehicleLabel(v)} />
                        ))}
                      </datalist>
                      <button
                        disabled={!addVehicleId}
                        onClick={() => setPendingVehicleChange({ vehicleId: addVehicleId, departmentId: selectedDepartmentId })}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                      >
                        {t("avdelinger.add")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {selectedVehicles.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">{t("avdelinger.noVehicles")}</p>
              ) : (
                selectedVehicles.map((v) =>
                  editingVehicleId === v.id ? (
                    <div key={v.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm last:border-0">
                      <input
                        autoFocus
                        value={editVehicleMake}
                        onChange={(e) => setEditVehicleMake(e.target.value)}
                        placeholder={t("avdelinger.vehicleMakePlaceholder")}
                        className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        value={editVehicleName}
                        onChange={(e) => setEditVehicleName(e.target.value)}
                        placeholder={t("avdelinger.vehiclePlatePlaceholder")}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <button onClick={confirmSaveVehicle} className="text-xs font-medium text-brand-dark">
                        {t("common.save")}
                      </button>
                      <button onClick={() => setEditingVehicleId(null)} className="text-xs text-slate-400">
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div key={v.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm last:border-0">
                      <Link href={`/bil/${v.id}`} className="hover:text-brand-dark hover:underline">
                        {vehicleLabel(v)}
                      </Link>
                      {isAdmin && (
                        <div className="flex gap-3">
                          <button onClick={() => startEditVehicle(v)} className="text-xs text-slate-400 hover:text-brand-dark">
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => setPendingVehicleChange({ vehicleId: v.id, departmentId: null })}
                            className="text-xs text-slate-400 hover:text-brand-dark"
                          >
                            {t("avdelinger.removeFromDept")}
                          </button>
                          <button onClick={() => setPendingDeleteVehicle(v.id)} className="text-xs text-slate-400 hover:text-red-600">
                            {t("common.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )
              )}
            </div>
          </>
        )}

        {subView === "ansatte" && (
          <>
            <p className="text-sm text-slate-500">
              {isAdmin ? t("avdelinger.employeesSubtitleAdmin") : t("avdelinger.employeesSubtitleModerator")}
            </p>

            {isAdmin && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowInvite((v) => !v)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {t("avdelinger.showInvite")}
                  </button>
                  <button
                    onClick={() => setShowMoveEmployee((v) => !v)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    {t("avdelinger.showMoveEmployee")}
                  </button>
                </div>

                {inviteMessage && <p className="text-sm text-green-700">{inviteMessage}</p>}

                {showInvite && (
                  <form
                    onSubmit={handleInvite}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.name")}</label>
                      <input
                        autoFocus
                        type="text"
                        required
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.email")}</label>
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.role")}</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as UserRole)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="sjafor">{t("nav.roleSjafor")}</option>
                        <option value="moderator">{t("nav.roleModerator")}</option>
                        <option value="admin">{t("nav.roleAdmin")}</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                    >
                      {inviting ? t("avdelinger.inviting") : t("avdelinger.invite")}
                    </button>
                  </form>
                )}

                {showMoveEmployee && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      autoFocus
                      type="text"
                      list="employees-not-in-department"
                      value={employeeQuery}
                      onChange={(e) => handleEmployeeQueryChange(e.target.value)}
                      placeholder={t("avdelinger.moveEmployeePlaceholder")}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <datalist id="employees-not-in-department">
                      {employeesNotInDepartment.map((u) => (
                        <option key={u.id} value={u.full_name} />
                      ))}
                    </datalist>
                    <button
                      disabled={!addEmployeeId}
                      onClick={() => setPendingEmployeeChange({ userId: addEmployeeId, departmentId: selectedDepartmentId })}
                      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                    >
                      {t("avdelinger.add")}
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="responsive-table w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">{t("avdelinger.name")}</th>
                    <th className="px-4 py-2">{t("avdelinger.email")}</th>
                    <th className="px-4 py-2">{t("avdelinger.role")}</th>
                    <th className="px-4 py-2">{t("avdelinger.status")}</th>
                    {(isAdmin || isModerator) && <th className="px-4 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        {t("avdelinger.noEmployees")}
                      </td>
                    </tr>
                  ) : (
                    selectedEmployees.map((u) =>
                      editingUserId === u.id ? (
                        <tr key={u.id} className="border-b border-slate-100 bg-slate-50 last:border-0">
                          <td className="px-4 py-2" data-label={t("avdelinger.name")}>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-slate-400" data-label={t("avdelinger.email")}>{u.email}</td>
                          <td className="px-4 py-2" data-label={t("avdelinger.role")}>
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as UserRole)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="sjafor">{t("nav.roleSjafor")}</option>
                              <option value="moderator">{t("nav.roleModerator")}</option>
                              <option value="admin">{t("nav.roleAdmin")}</option>
                            </select>
                          </td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                            <button onClick={() => setPendingSaveUserId(u.id)} className="mr-2 text-xs font-medium text-brand-dark hover:text-brand-dark">
                              {t("common.save")}
                            </button>
                            <button onClick={() => setEditingUserId(null)} className="text-xs text-slate-400">
                              {t("common.cancel")}
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={u.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 font-medium text-slate-800" data-label={t("avdelinger.name")}>
                            <Link href={`/sammendrag?user=${u.id}`} className="hover:text-brand-dark hover:underline">
                              {u.full_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-500" data-label={t("avdelinger.email")}>{u.email}</td>
                          <td className="px-4 py-2 text-slate-500" data-label={t("avdelinger.role")}>{ROLE_LABELS[u.role]}</td>
                          <td className="px-4 py-2" data-label={t("avdelinger.status")}>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                u.status === "aktiv"
                                  ? "bg-green-100 text-green-800"
                                  : u.status === "deaktivert"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {u.status === "aktiv"
                                ? t("avdelinger.active")
                                : u.status === "deaktivert"
                                  ? t("avdelinger.deactivated")
                                  : t("avdelinger.invited")}
                            </span>
                          </td>
                          {(isAdmin || isModerator) && (
                            <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                              {isAdmin && (
                                <>
                                  <button onClick={() => startEditUser(u)} className="mr-3 text-xs text-slate-400 hover:text-brand-dark">
                                    {t("common.edit")}
                                  </button>
                                  <button
                                    onClick={() => setPendingEmployeeChange({ userId: u.id, departmentId: null })}
                                    className="mr-3 text-xs text-slate-400 hover:text-brand-dark"
                                  >
                                    {t("avdelinger.removeFromDept")}
                                  </button>
                                </>
                              )}
                              {u.status !== "invitert" && (isAdmin || u.role === "sjafor") && (
                                <button
                                  onClick={() => {
                                    setPendingResetPasswordUser({ id: u.id, name: u.full_name });
                                    setResetPasswordValue("");
                                    setResetPasswordError(null);
                                  }}
                                  className="mr-3 text-xs text-slate-400 hover:text-brand-dark"
                                >
                                  {t("avdelinger.resetPassword")}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() =>
                                    setPendingDeactivateUser({ id: u.id, name: u.full_name, deactivate: u.status !== "deaktivert" })
                                  }
                                  className={`text-xs ${
                                    u.status === "deaktivert" ? "text-slate-400 hover:text-brand-dark" : "text-slate-400 hover:text-red-600"
                                  }`}
                                >
                                  {u.status === "deaktivert" ? t("avdelinger.reactivate") : t("avdelinger.deactivate")}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pendingDeleteDepartment && (
          <ReasonDialog
            title={t("avdelinger.deleteDeptTitle")}
            message={t("avdelinger.deleteDeptMessage")}
            confirmLabel={t("common.delete")}
            danger
            onConfirm={confirmDeleteDepartment}
            onCancel={() => setPendingDeleteDepartment(null)}
          />
        )}

        {pendingDeleteRoute && (
          <ReasonDialog
            title={t("avdelinger.deleteRouteTitle")}
            confirmLabel={t("common.delete")}
            danger
            onConfirm={confirmDeleteRoute}
            onCancel={() => setPendingDeleteRoute(null)}
          />
        )}

        {pendingVehicleChange && (
          <ReasonDialog
            title={pendingVehicleChange.departmentId ? t("avdelinger.addToDeptTitle") : t("avdelinger.removeFromDeptTitle")}
            message={t("avdelinger.shownInLog")}
            confirmLabel={t("avdelinger.confirm")}
            onConfirm={confirmVehicleChange}
            onCancel={() => setPendingVehicleChange(null)}
          />
        )}

        {pendingDeleteVehicle && (
          <ReasonDialog
            title={t("avdelinger.deleteVehicleTitle")}
            confirmLabel={t("common.delete")}
            danger
            onConfirm={confirmDeleteVehicle}
            onCancel={() => setPendingDeleteVehicle(null)}
          />
        )}

        {pendingEmployeeChange && (
          <ReasonDialog
            title={pendingEmployeeChange.departmentId ? t("avdelinger.addToDeptTitle") : t("avdelinger.removeFromDeptTitle")}
            message={t("avdelinger.shownInLog")}
            confirmLabel={t("avdelinger.confirm")}
            onConfirm={confirmEmployeeChange}
            onCancel={() => setPendingEmployeeChange(null)}
          />
        )}

        {pendingSaveUserId && (
          <ReasonDialog
            title={t("avdelinger.explainChangeTitle")}
            message={t("avdelinger.explainChangeMessage")}
            confirmLabel={t("common.save")}
            onConfirm={confirmSaveUserEdit}
            onCancel={() => setPendingSaveUserId(null)}
          />
        )}

        {pendingDeactivateUser && (
          <ReasonDialog
            title={
              pendingDeactivateUser.deactivate
                ? t("avdelinger.deactivateUserTitle", { name: pendingDeactivateUser.name })
                : t("avdelinger.reactivateUserTitle", { name: pendingDeactivateUser.name })
            }
            message={pendingDeactivateUser.deactivate ? t("avdelinger.deactivateUserMessage") : undefined}
            confirmLabel={pendingDeactivateUser.deactivate ? t("avdelinger.deactivate") : t("avdelinger.reactivate")}
            danger={pendingDeactivateUser.deactivate}
            onConfirm={confirmToggleDeactivate}
            onCancel={() => setPendingDeactivateUser(null)}
          />
        )}

        {resetPasswordModal}
      </div>
    );
  }

  // ============ Totaloversikt: Ansatte/biler på tvers av alle avdelinger ============
  if (showOverview) {
    return (
      <div className="space-y-6">
        <div>
          <button onClick={() => setShowOverview(false)} className="mb-2 text-sm text-slate-500 hover:text-brand-dark">
            {t("avdelinger.backToDepartments")}
          </button>
          <h1 className="text-xl font-bold text-slate-900">{t("avdelinger.overviewTitle")}</h1>
        </div>

        <div className="flex w-fit gap-1 rounded-md bg-slate-100 p-1 text-sm">
          <button
            onClick={() => setOverviewTab("ansatte")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              overviewTab === "ansatte" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("avdelinger.employeesCard")}
          </button>
          <button
            onClick={() => setOverviewTab("biler")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              overviewTab === "biler" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("avdelinger.vehiclesCard")}
          </button>
        </div>

        {overviewTab === "ansatte" ? (
          <>
            {isAdmin && (
            <div>
              <button
                onClick={() => setShowOverviewInvite((v) => !v)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t("avdelinger.showInvite")}
              </button>
              {showOverviewInvite && (
                <form
                  onSubmit={handleInvite}
                  className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
                >
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.name")}</label>
                    <input
                      autoFocus
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.email")}</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.role")}</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="sjafor">{t("nav.roleSjafor")}</option>
                      <option value="moderator">{t("nav.roleModerator")}</option>
                      <option value="admin">{t("nav.roleAdmin")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.department")}</label>
                    <select
                      value={overviewInviteDepartmentId}
                      onChange={(e) => setOverviewInviteDepartmentId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">{t("common.noneSelected")}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                  >
                    {inviting ? t("avdelinger.inviting") : t("avdelinger.invite")}
                  </button>
                </form>
              )}
              {inviteMessage && <p className="mt-2 text-sm text-green-700">{inviteMessage}</p>}
            </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">{t("avdelinger.name")}</th>
                  <th className="px-4 py-2">{t("sammendrag.department")}</th>
                  <th className="px-4 py-2">{t("avdelinger.role")}</th>
                  <th className="px-4 py-2">{t("avdelinger.activeStatus")}</th>
                  {(isAdmin || isModerator) && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      {t("avdelinger.noEmployees")}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-800" data-label={t("avdelinger.name")}>
                        <Link href={`/sammendrag?user=${u.id}`} className="hover:text-brand-dark hover:underline">
                          {u.full_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-500" data-label={t("sammendrag.department")}>
                        {departments.find((d) => d.id === u.department_id)?.name ?? t("bil.noDepartment")}
                      </td>
                      <td className="px-4 py-2 text-slate-500" data-label={t("avdelinger.role")}>{ROLE_LABELS[u.role]}</td>
                      <td className="px-4 py-2" data-label={t("avdelinger.activeStatus")}>
                        {activeUserIds.has(u.id) ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500" />
                            {t("avdelinger.clockedIn")}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{t("avdelinger.notClockedIn")}</span>
                        )}
                      </td>
                      {(isAdmin || isModerator) && (
                        <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                          {u.status !== "invitert" && (isAdmin || u.role === "sjafor") && (
                            <button
                              onClick={() => {
                                setPendingResetPasswordUser({ id: u.id, name: u.full_name });
                                setResetPasswordValue("");
                                setResetPasswordError(null);
                              }}
                              className="text-xs text-slate-400 hover:text-brand-dark"
                            >
                              {t("avdelinger.resetPassword")}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <>
            {isAdmin && (
            <div>
              <button
                onClick={() => setShowOverviewAddVehicle((v) => !v)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {t("avdelinger.showAddVehicle")}
              </button>
              {showOverviewAddVehicle && (
                <form
                  onSubmit={handleAddVehicle}
                  className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.vehicleMakePlaceholder")}</label>
                    <input
                      autoFocus
                      type="text"
                      value={newVehicleMake}
                      onChange={(e) => setNewVehicleMake(e.target.value)}
                      placeholder={t("avdelinger.vehicleMakePlaceholder")}
                      className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("avdelinger.vehiclePlatePlaceholder")}</label>
                    <input
                      type="text"
                      value={newVehicle}
                      onChange={(e) => setNewVehicle(e.target.value)}
                      placeholder={t("avdelinger.vehiclePlatePlaceholder")}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.department")}</label>
                    <select
                      value={overviewVehicleDepartmentId}
                      onChange={(e) => setOverviewVehicleDepartmentId(e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">{t("common.noneSelected")}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90">
                    {t("avdelinger.addVehicle")}
                  </button>
                </form>
              )}
            </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">{t("avdelinger.vehiclesCard")}</th>
                  <th className="px-4 py-2">{t("sammendrag.department")}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                      {t("avdelinger.noVehicles")}
                    </td>
                  </tr>
                ) : (
                  vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-medium text-slate-800" data-label={t("avdelinger.vehiclesCard")}>
                        <Link href={`/bil/${v.id}`} className="hover:text-brand-dark hover:underline">
                          {vehicleLabel(v)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-500" data-label={t("sammendrag.department")}>
                        {departments.find((d) => d.id === v.department_id)?.name ?? t("bil.noDepartment")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </>
        )}
        {resetPasswordModal}
      </div>
    );
  }

  // ============ Nivå 0: Liste over avdelinger (admin og moderator ser alle) ============
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("avdelinger.title")}</h1>
        <p className="text-sm text-slate-500">{t("avdelinger.subtitle")}</p>
      </div>

      <button
        onClick={() => setShowOverview(true)}
        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand hover:shadow"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("avdelinger.overviewTitle")}</span>
          <span className="text-slate-400">→</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <div className="text-xl font-bold text-slate-900">{departments.length}</div>
            <div className="text-xs text-slate-500">{t("avdelinger.title")}</div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{users.length}</div>
            <div className="text-xs text-slate-500">{t("avdelinger.employeesCard")}</div>
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{vehicles.length}</div>
            <div className="text-xs text-slate-500">{t("avdelinger.vehiclesCard")}</div>
          </div>
        </div>
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <button
          onClick={() => setShowAddDepartment((v) => !v)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t("avdelinger.showAddDepartment")}
        </button>
        {showAddDepartment && (
          <form onSubmit={handleAddDepartment} className="mt-3 flex gap-2">
            <input
              autoFocus
              type="text"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              placeholder={t("avdelinger.newDepartmentPlaceholder")}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90">
              {t("avdelinger.add")}
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => openDepartment(d.id)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand hover:shadow"
          >
            <div className="font-semibold text-slate-800">{d.name}</div>
            <div className="mt-1 text-xs text-slate-500">
              {routeCount(d.id)} {t("avdelinger.routeWord")}
              {routeCount(d.id) === 1 ? "" : t("avdelinger.routeSuffix")} · {vehicleCount(d.id)} {t("avdelinger.vehicleWord")}
              {vehicleCount(d.id) === 1 ? "" : t("avdelinger.vehicleSuffix")} · {employeeCount(d.id)} {t("avdelinger.employeeWord")}
              {employeeCount(d.id) === 1 ? "" : t("avdelinger.employeeSuffix")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
