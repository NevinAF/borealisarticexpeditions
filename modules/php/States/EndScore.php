<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArcticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArcticExpeditions\Game;

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
        $this->game->notifyAllWithBoardState(
            'finalScoring',
            clienttranslate('Final scoring applied'),
        );

        return ST_END_GAME;
    }
}
