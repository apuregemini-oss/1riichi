"""Apply the user's uniform 30/10 uma to imported final-point records."""
from decimal import Decimal

VERSION = '30-10-v1'

def standardize_game(game):
    if game.get('result_type') != 'final_points' or game.get('points_standardization'):
        return game
    old_uma = game['date'][:10] < '2025-06-22' or game['date'][:10] == '2025-07-20'
    results = sorted(game['results'], key=lambda r: -r['final_points'])
    original = [Decimal(str(r['final_points'])) for r in results]
    for result, points in zip(results, original):
        higher = sum(p > points for p in original)
        tied = sum(p == points for p in original)
        slots = list(range(higher, higher+tied))
        adjustment = sum([10,0,0,-10][i] for i in slots)/tied if old_uma else 0
        result['original_final_points'] = float(points)
        result['uma_adjustment'] = adjustment
        result['final_points'] = float(points + Decimal(str(adjustment)))
    scores = []
    for result in results:
        slots = [i for i,r in enumerate(results) if r['place'] == result['place']]
        bonus = sum(Decimal(x) for i,x in enumerate([50,10,-10,-30]) if i in slots)/len(slots)
        scores.append((Decimal(str(result['final_points']))-bonus)*1000+30000)
    valid = (sum(scores)==100000 and all(s==s.to_integral_value() for s in scores)
             and all(scores[i]>=scores[i+1] for i in range(3)))
    for result, score in zip(results, scores):
        result['score'] = int(score) if valid else None
    game['points_standardization'] = {'version':VERSION, 'original_uma':[20,10,-10,-20] if old_uma else [30,10,-10,-30], 'uma':[30,10,-10,-30], 'oka':20, 'returning_score':30000, 'cutoff_basis':'2025-06-22; 2025-07-20 uses earlier rules'}
    game['score_reconstructed'] = valid
    game['notes'] = (f"Imported game {game.get('source_game_number', '')}. "
        + ('Converted 20/10 uma to 30/10. ' if old_uma else '30/10 uma. ')
        + ('Scores reconstructed with 20 oka and 30,000 return.' if valid else 'Ending scores unresolved: source points conflict with recorded placement order.'))
    assert sum(Decimal(str(r['final_points'])) for r in results)==0
    return game
