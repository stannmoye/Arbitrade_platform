import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { addTicketAttachment, addTicketMessage, adjustCustomerBalance, bulkCreateOpportunityOffers, createAdminCustomer, createNotification, createRiskReport, createTicket, createTrade, deleteAdminCustomer, getCustomerTicket, getAppSetting, getCustomerBalanceSummary, getTicketUploadPolicy, listAdminCustomers, listAllTickets, listBalances, listCurrencies, listCustomerOpportunities, listCustomerSessions, listCustomerTickets, listNotifications, listOpenOffers, listOpportunityPackagePolicies, listRiskReports, listTicketMessages, listTrades, provisionSignupCredit, revokeCustomerSession, setAppSetting, setCustomerPackage, settleTrade, updateAdminCustomer, updateCustomerControls, updateOpportunityPackagePolicies, upsertCustomerSession, createOpportunityOffer, upsertCurrency } from "./db";

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
    createTicket: protectedProcedure.input(z.object({ subject: z.string().min(3).max(200), body: z.string().min(1).max(20000), category: z.enum(["account","wallet","opportunity","security","technical"]).default("account"), priority: z.enum(["low", "normal", "high", "urgent"]) })).mutation(async ({ ctx, input }) => { const created=await createTicket(ctx.user.id,input); return created; }),
    tickets: protectedProcedure.query(({ ctx }) => listCustomerTickets(ctx.user.id)),
    ticketMessages: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ ctx, input }) => { if (!(await getCustomerTicket(ctx.user.id,input.ticketId))) throw new Error("Ticket not found"); return listTicketMessages(input.ticketId); }),
    replyTicket: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().min(1).max(20000) })).mutation(async ({ ctx, input }) => { if (!(await getCustomerTicket(ctx.user.id,input.ticketId))) throw new Error("Ticket not found"); await addTicketMessage(ctx.user.id,input.ticketId,input.body); return { success:true }; }),
    addAttachment: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), fileName: z.string().max(255), mimeType: z.string().max(160), sizeBytes: z.number().int().positive().max(25_000_000), storageKey: z.string().max(512) })).mutation(({ ctx, input }) => addTicketAttachment(ctx.user.id, input)),
    uploadPolicy: protectedProcedure.query(() => getTicketUploadPolicy()),
    balances: protectedProcedure.query(({ ctx }) => getCustomerBalanceSummary(ctx.user.id)),
    opportunities: protectedProcedure.query(({ ctx }) => listCustomerOpportunities(ctx.user.id)),
    trades: protectedProcedure.query(async ({ ctx }) => { const rows=await listTrades(ctx.user.id); for (const row of rows) if (row.status === "confirmed" && new Date(row.settlesAt).getTime() <= Date.now()) await settleTrade(row.id); return listTrades(ctx.user.id); }),
    invest: protectedProcedure.input(z.object({ offerId: z.number().int().positive(), amountMinor: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const result=await createTrade(ctx.user.id,input); await createNotification(ctx.user.id,"Practice allocation recorded",`Your ${result.currency} allocation is recorded in practice mode. No configured reward is credited without a verified execution result.`); return result; }),
    settle: protectedProcedure.input(z.object({ tradeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const rows=await listTrades(ctx.user.id); if(!rows.some(row=>row.id===input.tradeId)) throw new Error("Trade not found"); return { settled: await settleTrade(input.tradeId) }; }),
    notifications: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
  }),

  adminOperations: router({
    customers: adminProcedure.query(() => listAdminCustomers()),
    customerBalances: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => listBalances(input.userId)),
    currencies: adminProcedure.query(() => listCurrencies()),
    upsertCurrency: adminProcedure.input(z.object({ code: z.string().min(2).max(32), name: z.string().min(2).max(120), symbol: z.string().min(1).max(16), scale: z.number().int().min(0).max(18), assetType: z.enum(["fiat","crypto","token"]), usdRate: z.string().min(1).max(64), rateProvider: z.string().min(1).max(120), externalCode: z.string().max(80).optional(), enabled: z.boolean().optional() })).mutation(({ input }) => upsertCurrency(input)),
    createCustomer: adminProcedure.input(z.object({ name: z.string().min(2).max(160), email: z.string().email(), password: z.string().min(10).max(200), packageName: z.enum(["Starter","Growth","Pro","Institutional"]) })).mutation(({ input }) => createAdminCustomer(input)),
    updateCustomer: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(160), email: z.string().email(), packageName: z.enum(["Starter","Growth","Pro","Institutional"]) })).mutation(({ input }) => updateAdminCustomer(input)),
    deleteCustomer: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(({ input }) => deleteAdminCustomer(input.userId)),
    updateCustomerControls: adminProcedure.input(z.object({ userId: z.number().int().positive(), accountStatus: z.enum(["active","suspended","restricted"]).optional(), tradingEnabled: z.boolean().optional(), opportunitiesEnabled: z.boolean().optional(), withdrawalsEnabled: z.boolean().optional(), kycRequired: z.boolean().optional(), twoFactorRequired: z.boolean().optional(), emailVerified: z.boolean().optional(), riskTier: z.string().min(1).max(24).optional(), dailyTradeLimitMinor: z.number().int().min(0).max(1000000000).optional(), adminNote: z.string().max(2000).optional() })).mutation(({ ctx, input }) => updateCustomerControls(ctx.user.id, input)),
    adjustCustomerBalance: adminProcedure.input(z.object({ userId: z.number().int().positive(), currency: z.string().min(2).max(32), amountMinor: z.number().int().positive(), mode: z.enum(["credit","debit"]), reason: z.string().min(3).max(500) })).mutation(({ ctx, input }) => adjustCustomerBalance(ctx.user.id, input)),
    settings: adminProcedure.query(async () => ({ ticket: await getTicketUploadPolicy(), email: { provider: await getAppSetting("email.provider", "smtp"), fromName: await getAppSetting("email.fromName", "Arbitrade Support"), fromAddress: await getAppSetting("email.fromAddress", "no-reply@example.com"), replyTo: await getAppSetting("email.replyTo", "") }, opportunity: { frequencyPerMinute: Number(await getAppSetting("opportunity.frequencyPerMinute", "30")), countdownSeconds: Number(await getAppSetting("opportunity.countdownSeconds", "90")), signupCreditMinor: Number(await getAppSetting("signup.autoCreditMinor", "1000")), signupCreditCurrency: await getAppSetting("signup.autoCreditCurrency", "USD") } })),
    updateSettings: adminProcedure.input(z.object({ ticket: z.object({ maxAttachmentMb: z.number().int().min(1).max(100), allowedMimeTypes: z.array(z.string().min(1).max(120)).min(1).max(50) }).optional(), email: z.object({ provider: z.enum(["smtp", "sendgrid", "disabled"]), fromName: z.string().min(1).max(120), fromAddress: z.string().email(), replyTo: z.string().email().or(z.literal("")) }).optional(), opportunity: z.object({ frequencyPerMinute: z.number().int().min(1).max(1000), countdownSeconds: z.number().int().min(10).max(86400), signupCreditMinor: z.number().int().min(0).max(100000000), signupCreditCurrency: z.enum(["USD","EUR","GBP","BTC","ETH"]) }).optional() })).mutation(async ({ ctx, input }) => { if (input.ticket) { await setAppSetting("ticket.maxAttachmentMb", String(input.ticket.maxAttachmentMb), ctx.user.id); await setAppSetting("ticket.allowedMimeTypes", input.ticket.allowedMimeTypes.join(","), ctx.user.id); } if (input.email) { await setAppSetting("email.provider", input.email.provider, ctx.user.id); await setAppSetting("email.fromName", input.email.fromName, ctx.user.id); await setAppSetting("email.fromAddress", input.email.fromAddress, ctx.user.id); await setAppSetting("email.replyTo", input.email.replyTo, ctx.user.id); } if (input.opportunity) { await setAppSetting("opportunity.frequencyPerMinute", String(input.opportunity.frequencyPerMinute), ctx.user.id); await setAppSetting("opportunity.countdownSeconds", String(input.opportunity.countdownSeconds), ctx.user.id); await setAppSetting("signup.autoCreditMinor", String(input.opportunity.signupCreditMinor), ctx.user.id); await setAppSetting("signup.autoCreditCurrency", input.opportunity.signupCreditCurrency, ctx.user.id); } return { success: true }; }),
    offers: adminProcedure.query(() => listOpenOffers()),
    packagePolicies: adminProcedure.query(() => listOpportunityPackagePolicies()),
    updatePackagePolicies: adminProcedure.input(z.object({ policies: z.array(z.object({ packageName: z.string().min(1).max(40), maxPopupsPerMinute: z.number().int().min(1).max(1000), maxVisibleOffers: z.number().int().min(1).max(10000), enabled: z.boolean() })).min(1).max(20) })).mutation(({ ctx, input }) => updateOpportunityPackagePolicies(ctx.user.id, input.policies)),
    setCustomerPackage: adminProcedure.input(z.object({ email: z.string().email(), packageName: z.enum(["Starter","Growth","Pro","Institutional"]) })).mutation(({ input }) => setCustomerPackage(input.email, input.packageName)),
    createOffer: adminProcedure.input(z.object({ symbol: z.string().min(1).max(40), venueFrom: z.string().min(1).max(80), venueTo: z.string().min(1).max(80), currency: z.enum(["USD","EUR","GBP","BTC","ETH"]), minimumMinor: z.number().int().positive(), expectedRewardBps: z.number().int().min(1).max(5000), durationSeconds: z.number().int().min(10).max(86400) })).mutation(({ input }) => createOpportunityOffer(input)),
    bulkCreateOffers: adminProcedure.input(z.object({ offers: z.array(z.object({ symbol: z.string().min(1).max(40), venueFrom: z.string().min(1).max(80), venueTo: z.string().min(1).max(80), currency: z.enum(["USD","EUR","GBP","BTC","ETH"]), minimumMinor: z.number().int().positive(), expectedRewardBps: z.number().int().min(1).max(5000), durationSeconds: z.number().int().min(10).max(86400) })).min(1).max(5000) })).mutation(({ input }) => bulkCreateOpportunityOffers(input.offers)),
    tickets: adminProcedure.query(() => listAllTickets()),
    ticketMessages: adminProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(({ input }) => listTicketMessages(input.ticketId)),
    replyTicket: adminProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().min(1).max(20000), status: z.enum(["answered", "resolved", "closed"]) })).mutation(async ({ ctx, input }) => { const ticket=(await listAllTickets()).find(row=>row.id===input.ticketId); if(!ticket) throw new Error("Ticket not found"); await addTicketMessage(ctx.user.id,input.ticketId,input.body,input.status); await createNotification(ticket.customerId,"Support ticket updated",`An admin replied to ticket ${ticket.ticketNumber}.`); return { success:true }; }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
