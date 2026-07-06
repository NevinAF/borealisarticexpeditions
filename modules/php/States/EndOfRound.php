<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\States\EndScore;

class EndOfRound extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 13,
            type: StateType::GAME,
            name: 'endOfRound',
        );
    }

    public function onEnteringState(?int $activePlayerId = null)
    {
        $g = $this->game;
        $g->deactivateClaimedObjectives();
        $g->clearPendingObjectivePrompts();

        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $this->bga->notify->player(
                (int)$pid,
                'endOfRound',
                clienttranslate('End of round'),
                [
                    'boardState' => $g->getBoardState((int)$pid),
                ]
            );
        }

        $mull = [];
        foreach ($g->getNextPlayerTable() as $pid => $_) {
            if ($pid === 0) continue;
            $mull[$pid] = false;
        }
        $g->setMulliganUsed($mull);

        if (count($g->playersWithLocationSevenPlusCards()) > 0) {
            return EndScore::class;
        }
        $leader = $g->getRoundLeaderId();
        $g->gamestate->changeActivePlayer($leader);
        $g->updateObjectiveConditions();

        return Gameplay::class;
    }
}
