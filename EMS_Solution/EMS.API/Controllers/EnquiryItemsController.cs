using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EMS.Data.Data;
using EMS.Data.Models;
using EMS.Shared.DTOs;

namespace EMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EnquiryItemsController : ControllerBase
{
    private readonly EmsDbContext _context;

    public EnquiryItemsController(EmsDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<EnquiryItemDto>>> GetEnquiryItems()
    {
        var items = await _context.EnquiryItems.ToListAsync();
        return Ok(items.Select(MapToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<EnquiryItemDto>> GetEnquiryItem(int id)
    {
        var item = await _context.EnquiryItems.FindAsync(id);
        return item == null ? NotFound() : Ok(MapToDto(item));
    }

    [HttpPost]
    public async Task<ActionResult<EnquiryItemDto>> CreateEnquiryItem(EnquiryItemDto dto)
    {
        var item = MapToEntity(dto);
        _context.EnquiryItems.Add(item);
        await _context.SaveChangesAsync();
        dto.ItemID = item.ItemID;
        return CreatedAtAction(nameof(GetEnquiryItem), new { id = item.ItemID }, dto);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateEnquiryItem(int id, EnquiryItemDto dto)
    {
        if (id != dto.ItemID) return BadRequest();
        var item = await _context.EnquiryItems.FindAsync(id);
        if (item == null) return NotFound();
        
        UpdateEntity(item, dto);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteEnquiryItem(int id)
    {
        var item = await _context.EnquiryItems.FindAsync(id);
        if (item == null) return NotFound();
        _context.EnquiryItems.Remove(item);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static EnquiryItemDto MapToDto(EnquiryItem i) => new()
    {
        ItemID = i.ItemID,
        ItemName = i.ItemName,
        CompanyName = i.CompanyName,
        DepartmentName = i.DepartmentName,
        Status = i.Status,
        CommonMailIds = i.CommonMailIds,
        CCMailIds = i.CCMailIds
    };

    private static EnquiryItem MapToEntity(EnquiryItemDto dto) => new()
    {
        ItemName = dto.ItemName,
        CompanyName = dto.CompanyName,
        DepartmentName = dto.DepartmentName,
        Status = dto.Status,
        CommonMailIds = dto.CommonMailIds,
        CCMailIds = dto.CCMailIds
    };

    private static void UpdateEntity(EnquiryItem entity, EnquiryItemDto dto)
    {
        entity.ItemName = dto.ItemName;
        entity.CompanyName = dto.CompanyName;
        entity.DepartmentName = dto.DepartmentName;
        entity.Status = dto.Status;
        entity.CommonMailIds = dto.CommonMailIds;
        entity.CCMailIds = dto.CCMailIds;
    }
}
