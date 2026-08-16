'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const CrmContext = createContext(null);

export function CrmProvider({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [team, setTeam] = useState([]);
  const [activityVersion, setActivityVersion] = useState(0);

  async function refreshTeam(orgId = membership?.organization_id) {
    if (!orgId) return;
    const { data } = await supabase.from('org_members')
      .select('organization_id,user_id,role,active,full_name,avatar_url,job_title,email,created_at,updated_at')
      .eq('organization_id', orgId).order('full_name', { ascending: true });
    setTeam(data || []);
  }

  async function boot() {
    setLoading(true);
    const { data: { user: current } } = await supabase.auth.getUser();
    if (!current) { setLoading(false); router.replace('/login'); return; }
    setUser(current);
    const { data: member } = await supabase.from('org_members')
      .select('organization_id,user_id,role,active,full_name,avatar_url,job_title,email,created_at,updated_at')
      .eq('user_id', current.id).eq('active', true).maybeSingle();
    if (!member) { setMembership(null); setLoading(false); return; }
    setMembership(member);
    await refreshTeam(member.organization_id);
    setLoading(false);
  }

  useEffect(() => { boot(); }, []);
  useEffect(() => {
    if (!membership?.organization_id) return;
    const channel = supabase.channel(`radar-crm-${membership.organization_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => setActivityVersion(v => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => setActivityVersion(v => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, () => setActivityVersion(v => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publishers' }, () => setActivityVersion(v => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_events' }, () => setActivityVersion(v => v + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [membership?.organization_id]);

  const role = membership?.role;
  const isAdmin = role === 'owner' || role === 'admin';
  const isManager = isAdmin || role === 'supervisor';
  const teamMap = useMemo(() => Object.fromEntries(team.map(m => [m.user_id, m])), [team]);

  const value = { supabase, loading, user, membership, team, teamMap, role, isAdmin, isManager, activityVersion, refreshTeam, refresh: boot };
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm deve ser usado dentro de CrmProvider');
  return ctx;
}
