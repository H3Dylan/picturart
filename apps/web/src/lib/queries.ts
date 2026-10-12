import type {
  CreatedInvite,
  CreateEventInput,
  EventSummary,
  InvitePreview,
  LoginInput,
  Me,
  SignupInput,
  UpdateMeInput,
} from '@picturart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';

export const keys = {
  me: ['me'] as const,
  events: ['events'] as const,
  invite: (token: string) => ['invite', token] as const,
};

/** L'utilisateur connecté, ou `null` si personne n'est connecté. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<Me>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<Me>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (me) => client.setQueryData(keys.me, me),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      client.clear();
      client.setQueryData(keys.me, null);
    },
  });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api<Me>('/me', { method: 'PATCH', body: input }),
    onSuccess: (me) => client.setQueryData(keys.me, me),
  });
}

export function useEvents() {
  return useQuery({ queryKey: keys.events, queryFn: () => api<EventSummary[]>('/events') });
}

export function useCreateEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) =>
      api<EventSummary>('/events', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.events }),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (eventId: string) =>
      api<CreatedInvite>(`/events/${eventId}/invites`, { method: 'POST' }),
  });
}

export function useInvite(token: string) {
  return useQuery({
    queryKey: keys.invite(token),
    queryFn: () => api<InvitePreview>(`/invites/${token}`),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input?: SignupInput) =>
      api<{ eventId: string; me: Me | null }>(`/invites/${token}/accept`, {
        method: 'POST',
        ...(input && { body: input }),
      }),
    onSuccess: ({ me }) => {
      if (me) client.setQueryData(keys.me, me);
      client.invalidateQueries({ queryKey: keys.events });
    },
  });
}
