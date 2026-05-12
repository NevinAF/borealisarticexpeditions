class Game {
    constructor(bga) {
        this.bga = bga;
    }
    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.setupNotifications();
    }
    setupNotifications() { }
}

export { Game };
