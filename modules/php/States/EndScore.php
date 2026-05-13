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
        foreach ($this->game->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'finalScoring',
                clienttranslate('Final scoring applied'),
                [
                    'boardState' => $this->game->getBoardState((int)$pid),
                ]
            );
        }

        return ST_END_GAME;
    }
}
