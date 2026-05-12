export interface Game extends GameGui<
  BorealisArticExpeditionsPlayer,
  BorealisArticExpeditionsGamedatas
> {}

export class Game {
  constructor(
    bga: Bga<BorealisArticExpeditionsPlayer, BorealisArticExpeditionsGamedatas>,
  ) {
    this.bga = bga;
  }

  public setup(gamedatas: BorealisArticExpeditionsGamedatas) {
    console.log("SETUP", gamedatas);

    this.gamedatas = gamedatas;
    this.setupNotifications();

    this.bga.gameArea.getElement().insertAdjacentHTML(
      "beforeend",
      `
        <div id="testing_playarea">Hello World</div>
    `,
    );
  }
  public setupNotifications() {}
}
