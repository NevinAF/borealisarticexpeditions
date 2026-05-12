class Game {
    constructor(bga) {
        this.bga = bga;
    }
    setup(gamedatas) {
        console.log("SETUP", gamedatas);
        this.gamedatas = gamedatas;
        this.setupNotifications();
        this.bga.gameArea.getElement().insertAdjacentHTML("beforeend", `
        <div id="testing_playarea">Hello World</div>
    `);
    }
    setupNotifications() { }
}

export { Game };
