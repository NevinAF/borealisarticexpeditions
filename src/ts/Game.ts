export class Game {
  public bga: Bga<
    BorealisArticExpeditionsPlayer,
    BorealisArticExpeditionsGamedatas
  >;
  private gamedatas: BorealisArticExpeditionsGamedatas;

  constructor(
    bga: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>,
  ) {
    this.bga = bga;
  }

  public setup(gamedatas: BorealisArticExpeditionsGamedatas) {
    this.gamedatas = gamedatas;
    this.setupNotifications();
  }
  public setupNotifications() {}
}
