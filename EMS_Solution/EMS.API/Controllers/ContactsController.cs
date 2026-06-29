using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using EMS.Data.Data;
using EMS.Data.Models;
using EMS.Shared.DTOs;

namespace EMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ContactsController : ControllerBase
{
    private readonly EmsDbContext _context;

    public ContactsController(EmsDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ContactDto>>> GetContacts()
    {
        var contacts = await _context.Contacts.ToListAsync();
        return Ok(contacts.Select(MapToDto));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ContactDto>> GetContact(int id)
    {
        var contact = await _context.Contacts.FindAsync(id);
        return contact == null ? NotFound() : Ok(MapToDto(contact));
    }

    [HttpPost]
    public async Task<ActionResult<ContactDto>> CreateContact(ContactDto dto)
    {
        var contact = MapToEntity(dto);
        _context.Contacts.Add(contact);
        await _context.SaveChangesAsync();
        dto.ContactID = contact.ContactID;
        return CreatedAtAction(nameof(GetContact), new { id = contact.ContactID }, dto);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateContact(int id, ContactDto dto)
    {
        if (id != dto.ContactID) return BadRequest();
        var contact = await _context.Contacts.FindAsync(id);
        if (contact == null) return NotFound();
        
        UpdateEntity(contact, dto);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteContact(int id)
    {
        var contact = await _context.Contacts.FindAsync(id);
        if (contact == null) return NotFound();
        _context.Contacts.Remove(contact);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static ContactDto MapToDto(Contact c) => new()
    {
        ContactID = c.ContactID,
        Category = c.Category,
        CompanyName = c.CompanyName,
        ContactName = c.ContactName,
        Designation = c.Designation,
        CategoryOfDesignation = c.CategoryOfDesignation,
        Address1 = c.Address1,
        Address2 = c.Address2,
        FaxNo = c.FaxNo,
        Phone = c.Phone,
        Mobile1 = c.Mobile1,
        Mobile2 = c.Mobile2,
        EmailId = c.EmailId
    };

    private static Contact MapToEntity(ContactDto dto) => new()
    {
        Category = dto.Category,
        CompanyName = dto.CompanyName,
        ContactName = dto.ContactName,
        Designation = dto.Designation,
        CategoryOfDesignation = dto.CategoryOfDesignation,
        Address1 = dto.Address1,
        Address2 = dto.Address2,
        FaxNo = dto.FaxNo,
        Phone = dto.Phone,
        Mobile1 = dto.Mobile1,
        Mobile2 = dto.Mobile2,
        EmailId = dto.EmailId
    };

    private static void UpdateEntity(Contact entity, ContactDto dto)
    {
        entity.Category = dto.Category;
        entity.CompanyName = dto.CompanyName;
        entity.ContactName = dto.ContactName;
        entity.Designation = dto.Designation;
        entity.CategoryOfDesignation = dto.CategoryOfDesignation;
        entity.Address1 = dto.Address1;
        entity.Address2 = dto.Address2;
        entity.FaxNo = dto.FaxNo;
        entity.Phone = dto.Phone;
        entity.Mobile1 = dto.Mobile1;
        entity.Mobile2 = dto.Mobile2;
        entity.EmailId = dto.EmailId;
    }
}
