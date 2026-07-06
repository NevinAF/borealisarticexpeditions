<?php

declare(strict_types=1);

namespace Bga\Games\BorealisArticExpeditions\States;

use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\BorealisArticExpeditions\Game;
use Bga\Games\BorealisArticExpeditions\Material;

class PromptClaimObjective extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 14,
            type: StateType::MULTIPLE_ACTIVE_PLAYER,
            name: 'promptClaimObjective',
            description: clienttranslate('Waiting for players to claim objectives'),
            descriptionMyTurn: clienttranslate('${you}: claim objective or pass'),
        );
    }

    public function onEnteringState(?int $activePlayerId = null): mixed
    {
        $returnState = $this->game->getPromptClaimReturnState();
        $players = array_keys($this->getEligiblePendingByPlayer());
        if (empty($players)) {
            $this->game->clearPromptClaimReturnState();
            return $returnState;
        }

        $this->game->gamestate->setPlayersMultiactive(array_map('intval', $players), $returnState, true);
        return null;
    }

    public function getArgs(): array
    {
        $eligible = $this->getEligiblePendingByPlayer();
        $objectivesData = Material::getObjectivesData();
        $pendingByPlayer = [];
        foreach ($eligible as $pid => $indices) {
            $pendingByPlayer[$pid] = [];
            foreach ($indices as $idx) {
                $oid = (int) (($this->game->getObjectivesState()[$idx]['id'] ?? 0));
                $pendingByPlayer[$pid][] = [
                    'index' => $idx,
                    'id' => $oid,
                    'title' => $objectivesData[$oid]['title'] ?? (string) $oid,
                ];
            }
        }

        return [
            'pendingByPlayer' => $pendingByPlayer,
        ];
    }

    /**
     * @return array<int, list<int>>
     */
    private function getEligiblePendingByPlayer(): array
    {
        $objectives = $this->game->getObjectivesState();
        $pending = $this->game->getPendingObjectivePrompts();
        $eligible = [];
        foreach ($pending as $pid => $indices) {
            $pid = (int) $pid;
            foreach ($indices as $idx) {
                $idx = (int) $idx;
                if (! isset($objectives[$idx])) {
                    continue;
                }
                $obj = $objectives[$idx];
                $status = $obj['players'][$pid] ?? 'unmet';
                if ($obj['active'] && $status === 'meets') {
                    $eligible[$pid][] = $idx;
                }
            }
            if (! empty($eligible[$pid])) {
                $eligible[$pid] = array_values(array_unique($eligible[$pid]));
            }
        }

        return $eligible;
    }

    private function ensurePlayerCanResolveObjective(int $playerId, int $objectiveIndex): void
    {
        $eligible = $this->getEligiblePendingByPlayer();
        if (! in_array($objectiveIndex, $eligible[$playerId] ?? [], true)) {
            throw new UserException(clienttranslate('This objective cannot be claimed at this time. You may only claim the current pending objective.'));
        }
    }

    #[PossibleAction]
    public function actClaimPromptObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $currentPlayerId,
        array $args,
    ): mixed {
        $returnState = $this->game->getPromptClaimReturnState();
        $this->ensurePlayerCanResolveObjective($currentPlayerId, $objective_index);
        $this->game->resolveObjectivePrompt($currentPlayerId, $objective_index, true);

        $remaining = $this->getEligiblePendingByPlayer()[$currentPlayerId] ?? [];
        if (! empty($remaining)) {
            return null;
        }

        $finished = $this->game->gamestate->setPlayerNonMultiactive($currentPlayerId, $returnState);
        if ($finished) {
            $this->game->clearPromptClaimReturnState();
            return $returnState;
        }

        return null;
    }

    #[PossibleAction]
    public function actSkipPromptObjective(
        #[IntParam(min: 0, max: 2)] int $objective_index,
        int $currentPlayerId,
        array $args,
    ): mixed {
        $returnState = $this->game->getPromptClaimReturnState();
        $this->ensurePlayerCanResolveObjective($currentPlayerId, $objective_index);
        $this->game->resolveObjectivePrompt($currentPlayerId, $objective_index, false);

        $remaining = $this->getEligiblePendingByPlayer()[$currentPlayerId] ?? [];
        if (! empty($remaining)) {
            return null;
        }

        $finished = $this->game->gamestate->setPlayerNonMultiactive($currentPlayerId, $returnState);
        if ($finished) {
            $this->game->clearPromptClaimReturnState();
            return $returnState;
        }

        return null;
    }

    public function zombie(int $playerId)
    {
        $returnState = $this->game->getPromptClaimReturnState();
        $pending = $this->getEligiblePendingByPlayer()[$playerId] ?? [];
        if (empty($pending)) {
            $finished = $this->game->gamestate->setPlayerNonMultiactive($playerId, $returnState);
            if ($finished) {
                $this->game->clearPromptClaimReturnState();
                return $returnState;
            }
            return null;
        }

        return $this->actSkipPromptObjective((int) $pending[0], $playerId, $this->getArgs());
    }
}
