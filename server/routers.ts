import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { addTicketAttachment, addTicketMessage, createNotification, createRiskReport, createTicket, listAllTickets, listCustomerSessions, listCustomerTickets, listNotifications, listRiskReports, listTicketMessages, revokeCustomerSession, upsertCustomerSession } from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  customer: router({
    session: protectedProcedure.input(z.object({ deviceLabel: z.string().max(160), countryCode: z.string().max(8).optional() })).mutation(async ({ ctx, input }) => {
      const forwarded = ctx.req.headers["x-forwarded-for"];
      const ipAddress = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : ctx.req.socket.remoteAddress;
      const deviceLabel = input.deviceLabel || "Authenticated browser";
      await upsertCustomerSession(ctx.user.id, { deviceLabel, ipAddress, countryCode: input.countryCode, userAgent: ctx.req.headers["user-agent"] });
      return listCustomerSessions(ctx.user.id);
    }),
    sessions: protectedProcedure.query(({ ctx }) => listCustomerSessions(ctx.user.id)),
    revokeSession: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await revokeCustomerSession(ctx.user.id, input.id); return { success: true }; }),
    requestRiskReport: protectedProcedure.input(z.object({ title: z.string().min(3).max(200), requestedFor: z.string().max(200).optional() })).mutation(({ ctx, input }) => createRiskReport(ctx.user.id, input.title, input.requestedFor)),
    riskReports: protectedProcedure.query(({ ctx }) => listRiskReports(ctx.user.id)),
    createTicket: protectedProcedure.input(z.object({ subject: z.string().min(3).max(200), body: z.string().min(1).max(20000), priority: z.enum(["low", "normal", "high", "urgent"]) })).mutation(async ({ ctx, input }) => { const created=await createTicket(ctx.user.id,input); return created; }),
    tickets: protectedProcedure.query(({ ctx }) => listCustomerTickets(ctx.user.id)),
    ticketMessages: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ ctx, input }) => { const tickets=await listCustomerTickets(ctx.user.id); if(!tickets.some(t=>t.id===input.ticketId)) throw new Error("Ticket not found"); return listTicketMessages(input.ticketId); }),
    replyTicket: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().min(1).max(20000), status: z.enum(["open", "resolved", "closed"]).optional() })).mutation(async ({ ctx, input }) => { const tickets=await listCustomerTickets(ctx.user.id); if(!tickets.some(t=>t.id===input.ticketId)) throw new Error("Ticket not found"); await addTicketMessage(ctx.user.id,input.ticketId,input.body,input.status); return { success:true }; }),
    addAttachment: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), fileName: z.string().max(255), mimeType: z.string().max(160), sizeBytes: z.number().int().positive().max(25_000_000), storageKey: z.string().max(512) })).mutation(({ ctx, input }) => addTicketAttachment(ctx.user.id, input)),
    notifications: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
  }),

  adminOperations: router({
    tickets: adminProcedure.query(() => listAllTickets()),
    ticketMessages: adminProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(({ input }) => listTicketMessages(input.ticketId)),
    replyTicket: adminProcedure.input(z.object({ ticketId: z.number().int().positive(), customerId: z.number().int().positive(), body: z.string().min(1).max(20000), status: z.enum(["answered", "resolved", "closed"]) })).mutation(async ({ ctx, input }) => { await addTicketMessage(ctx.user.id,input.ticketId,input.body,input.status); await createNotification(input.customerId,"Support ticket updated",`An admin replied to ticket #${input.ticketId}.`); return { success:true }; }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
