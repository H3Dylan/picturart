import type {
  CommentDto,
  CreatedInvite,
  CreateEventInput,
  CreatePostInput,
  EventDetail,
  EventSummary,
  InvitePreview,
  LoginInput,
  Me,
  NotificationsPage,
  PlancheItem,
  PostDto,
  PostsPage,
  ReactionEmoji,
  Reactions,
  Role,
  SignupInput,
  UpdateMeInput,
} from '@picturart/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';
import { disablePush } from './pwa.ts';

export const keys = {
  me: ['me'] as const,
  events: ['events'] as const,
  event: (id: string) => ['event', id] as const,
  posts: (eventId: string) => ['posts', eventId] as const,
  feed: ['feed'] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string) => ['comments', postId] as const,
  planche: (eventId: string) => ['planche', eventId] as const,
  invite: (token: string) => ['invite', token] as const,
  notifications: ['notifications'] as const,
  unread: ['unread'] as const,
};

/** Tant que des photos se développent, on rafraîchit régulièrement. */
const pollWhileProcessing = (pages: PostsPage[] | undefined) =>
  pages?.some((page) => page.posts.some((post) => post.media.some((m) => m.status !== 'ready')))
    ? 3000
    : false;

export function useFeed() {
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }) =>
      api<PostsPage>(`/feed${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (query) => pollWhileProcessing(query.state.data?.pages),
  });
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: keys.post(id ?? ''),
    queryFn: () => api<PostDto>(`/posts/${id}`),
    enabled: Boolean(id),
  });
}

export function usePlanche(eventId: string, best = false) {
  return useQuery({
    queryKey: [...keys.planche(eventId), best ? 'meilleures' : 'date'],
    queryFn: () => api<PlancheItem[]>(`/events/${eventId}/media${best ? '?tri=meilleures' : ''}`),
  });
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: keys.comments(postId),
    queryFn: () => api<CommentDto[]>(`/posts/${postId}/comments`),
  });
}

export function useAddComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<CommentDto>(`/posts/${postId}/comments`, { method: 'POST', body: { body } }),
    onSuccess: (comment) => {
      client.setQueryData<CommentDto[]>(keys.comments(postId), (list) => [
        ...(list ?? []),
        comment,
      ]);
      client.invalidateQueries({ queryKey: keys.post(postId) });
      client.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api<void>(`/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: (_data, commentId) => {
      client.setQueryData<CommentDto[]>(keys.comments(postId), (list) =>
        (list ?? []).filter((c) => c.id !== commentId),
      );
      client.invalidateQueries({ queryKey: keys.post(postId) });
    },
  });
}

/** Réagir à un post ou à une photo (emoji, ou `null` pour retirer sa réaction). */
export function useReact(target: {
  kind: 'post' | 'media';
  id: string;
  postId: string;
  eventId: string;
}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (emoji: ReactionEmoji | null) =>
      api<Reactions>(`/${target.kind === 'post' ? 'posts' : 'media'}/${target.id}/reaction`, {
        method: emoji ? 'PUT' : 'DELETE',
        ...(emoji && { body: { emoji } }),
      }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.post(target.postId) });
      client.invalidateQueries({ queryKey: keys.feed });
      client.invalidateQueries({ queryKey: keys.posts(target.eventId) });
      client.invalidateQueries({ queryKey: keys.planche(target.eventId) });
    },
  });
}

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
    refetchInterval: (query) => pollWhileProcessing(query.state.data?.pages),
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
      client.invalidateQueries({ queryKey: keys.feed });
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
    mutationFn: async () => {
      // Cet appareil ne doit plus recevoir les notifications de ce compte
      await disablePush().catch(() => {});
      await api<void>('/auth/logout', { method: 'POST' });
    },
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

// ---- Activité et notifications --------------------------------------------------------
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) =>
      api<NotificationsPage>(
        `/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Nombre de notifications non lues (pastille de la barre de navigation). */
export function useUnread(enabled: boolean) {
  return useQuery({
    queryKey: keys.unread,
    queryFn: async () => (await api<{ unread: number }>('/notifications/unread')).unread,
    enabled,
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      api<{ unread: number }>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
    onSuccess: ({ unread }) => {
      client.setQueryData(keys.unread, unread);
      client.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

/** Couper ou rétablir les notifications push d'un événement. */
export function useMuteEvent(eventId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) =>
      api<{ muted: boolean }>(`/events/${eventId}/mute`, { method: 'PUT', body: { muted } }),
    onSuccess: ({ muted }) => {
      client.setQueryData<EventDetail>(keys.event(eventId), (d) => (d ? { ...d, muted } : d));
      client.invalidateQueries({ queryKey: keys.events });
    },
  });
}
