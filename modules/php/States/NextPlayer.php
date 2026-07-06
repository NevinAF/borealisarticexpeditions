<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\States\PromptClaimObjective;

class NextPlayer extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 90,
            type: StateType::GAME,
            name: 'nextPlayer',
            updateGameProgression: true,
        );
    }

    public function onEnteringState(int $activePlayerId)
    {
        $this->game->giveExtraTime($activePlayerId);
        if ($this->game->hasPendingObjectivePrompts()) {
            return PromptClaimObjective::class;
        }
        $leader = $this->game->getRoundLeaderId();
        $next = $this->game->getPlayerAfter($activePlayerId);
        if ($next === $leader) {
            return EndOfRound::class;
        }
        $this->game->activeNextPlayer();

        return Gameplay::class;
    }
}
