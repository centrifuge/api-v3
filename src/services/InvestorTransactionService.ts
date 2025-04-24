import { Service, mixinCommonStatics } from "./Service";
import { InvestorTransaction } from "ponder:schema";
import type { Context } from "ponder:registry";


export class InvestorTransactionService extends mixinCommonStatics(Service<typeof InvestorTransaction>, InvestorTransaction, "InvestorTransaction") {
  static async updateDepositRequest(context: Context, data: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type DEPOSIT_REQUEST_UPDATED with data:", data);
    return this.init(context, {...data, type: "DEPOSIT_REQUEST_UPDATED"});
  }

  static async updateRedeemRequest(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating redeem request", query);
    return this.init(context, {...query, type: "REDEEM_REQUEST_UPDATED"});
  }

  static async cancelDepositRequest(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type DEPOSIT_REQUEST_CANCELLED with data:", query);
    return this.init(context, {...query, type: "DEPOSIT_REQUEST_CANCELLED"});
  }

  static async cancelRedeemRequest(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type REDEEM_REQUEST_CANCELLED with data:", query);
    return this.init(context, {...query, type: "REDEEM_REQUEST_CANCELLED"});
  }

  static async executeDepositRequest(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type DEPOSIT_REQUEST_EXECUTED with data:", query);
    return this.init(context, {...query, type: "DEPOSIT_REQUEST_EXECUTED"});
  }

  static async executeRedeemRequest(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type REDEEM_REQUEST_EXECUTED with data:", query);
    return this.init(context, {...query, type: "REDEEM_REQUEST_EXECUTED"});
  }

  static async claimDeposit(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {
    console.info("Creating investor transaction of type DEPOSIT_CLAIMED with data:", query);
    return this.init(context, {...query, type: "DEPOSIT_CLAIMED"});
  }

  static async claimRedeem(context: Context, query: Omit<typeof InvestorTransaction.$inferInsert, "type">) {  
    console.info("Creating investor transaction of type REDEEM_CLAIMED with data:", query);
    return this.init(context, {...query, type: "REDEEM_CLAIMED"});
  }
}