import type {
  CreatedInvite,
  CreateEventInput,
  CreatePostInput,
  EventDetail,
  EventSummary,
  InvitePreview,
  LoginInput,
  Me,
  PostDto,
  PostsPage,
  Role,
  SignupInput,
  UpdateMeInput,
} from '@picturart/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';

export const keys = {
  me: ['me'] as const,
  events: ['events'] as const,
  event: (id: string) => ['event', id] as const,
  posts: (eventId: string) => ['posts', eventId] as const,
  invite: (token: string) => ['invite', token] as const,
};

export function useEvent(id: string) {
  return useQuery({ queryKey: keys.event(id), queryFn: () => api<EventDetail>(`/events/${id}`) });
}

export function useEventPosts(eventId: string) {
  return useInfiniteQuery({
    queryKey: keys.posts(eventId),
    queryFn: ({ pageParam }) =>
      api<PostsPage>(
        `/events/${eventId}/posts${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Tant que des photos se développent, on rafraîchit régulièrement
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.posts.some((post) => post.media.some((m) => m.status !== 'ready')),
      )
        ? 3000
        : false,
  });
}

export function useCreatePost() {
  return useMutation({
    mutationFn: (input: CreatePostInput) => api<PostDto>('/posts', { method: 'POST', body: input }),
  });
}

export function useDeletePost(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api<void>(`/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.posts(eventId) });
      client.invalidateQueries({ queryKey: keys.event(eventId) });
    },
  });
}

export function useUpdateMemberRole(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api<EventDetail>(`/events/${eventId}/members/${userId}`, { method: 'PATCH', body: { role } }),
    onSuccess: (detail) => client.setQueryData(keys.event(eventId), detail),
  });
}

export function useRemoveMember(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/events/${eventId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.event(eventId) });
      client.invalidateQueries({ queryKey: keys.events });
    },
  });
}

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
