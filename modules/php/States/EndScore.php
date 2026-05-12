<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArticExpeditions\Game;

const ST_END_GAME = 99;

class EndScore extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 98,
            type: StateType::GAME,
            name: 'endScore',
        );
    }

    public function onEnteringState()
    {
        $this->game->applyEndScoring();
        $this->bga->notify->all('finalScoring', clienttranslate('Final scoring applied'), []);

        return ST_END_GAME;
    }
}
